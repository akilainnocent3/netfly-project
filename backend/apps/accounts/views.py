import re
import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import client_ip
from apps.core.config import config
from apps.core.exceptions import APIError
from apps.core.throttling import throttle

from . import lockout
from .models import User
from .permissions import IsViewer
from .serializers import (
    AppSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    SessionSerializer,
    SignupSerializer,
    UsernameAvailabilitySerializer,
    UserSerializer,
    validate_username_format,
)
from .tokens import (
    RefreshError,
    issue_access_token,
    issue_refresh_token,
    revoke_all_for_user,
    revoke_refresh_token,
    rotate_refresh_token,
)

COOKIE_PATH = "/api/v1/auth"
CSRF_COOKIE = "netfly_csrf"
CSRF_HEADER = "HTTP_X_CSRF_TOKEN"
# Dummy hash so failed logins for unknown users take as long as real ones.
_DUMMY_HASH = make_password("netfly-timing-equaliser")


def refresh_cookie_name(app: str) -> str:
    return f"netfly_rt_{app}"


def _session_response(
    request,
    user: User,
    app: str,
    *,
    family=None,
    refresh=None,
    status_code=200,
    persistent: bool = True,
) -> Response:
    access, expires_in = issue_access_token(user)
    if refresh is None:
        refresh = issue_refresh_token(
            user,
            app,
            family=family,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            ip=client_ip(request),
            persistent=persistent,
        )
    csrf = secrets.token_urlsafe(24)
    response = Response(
        {
            "access": access,
            "expires_in": expires_in,
            "csrf": csrf,
            "user": UserSerializer(user).data,
        },
        status=status_code,
    )
    secure = config.get_bool("auth.cookie_secure", True)
    domain = config.get_str("auth.cookie_domain") or None
    # "Remember me" off: session cookies (gone when the browser closes), even after rotation.
    max_age = (
        config.get_int("auth.refresh_token_days", 30) * 86400 if refresh.record.persistent else None
    )
    response.set_cookie(
        refresh_cookie_name(app),
        refresh.raw,
        max_age=max_age,
        path=COOKIE_PATH,
        domain=domain,
        secure=secure,
        httponly=True,
        samesite="Lax",
    )
    response.set_cookie(
        f"{CSRF_COOKIE}_{app}",
        csrf,
        max_age=max_age,
        path="/",
        domain=domain,
        secure=secure,
        httponly=False,
        samesite="Lax",
    )
    response["Cache-Control"] = "no-store"
    return response


def _check_csrf(request, app: str) -> None:
    cookie = request.COOKIES.get(f"{CSRF_COOKIE}_{app}")
    header = request.META.get(CSRF_HEADER)
    if not cookie or not header or not secrets.compare_digest(cookie, header):
        raise APIError("Security check failed. Refresh the page and try again.", "csrf_failed", 403)


def _clear_cookies(response: Response, app: str) -> None:
    domain = config.get_str("auth.cookie_domain") or None
    response.delete_cookie(refresh_cookie_name(app), path=COOKIE_PATH, domain=domain)
    response.delete_cookie(f"{CSRF_COOKIE}_{app}", path="/", domain=domain)


class SignupView(APIView):
    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_signup")]

    @extend_schema(
        request=SignupSerializer, responses={201: SessionSerializer}, operation_id="auth_signup"
    )
    def post(self, request):
        if not config.get_bool("features.signup_enabled", True):
            raise APIError("Sign-ups are closed right now.", "signup_closed", 403)
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    data["username"],
                    data["password"],
                    full_name=data["full_name"],
                    translation_mode=config.get_str("content.default_translation_mode"),
                )
        except IntegrityError as exc:
            raise APIError(
                "That username is taken.",
                "validation_error",
                400,
                {"username": "That username is taken."},
            ) from exc
        return _session_response(request, user, data["app"], status_code=201)


class LoginView(APIView):
    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_login")]

    @extend_schema(request=LoginSerializer, responses=SessionSerializer, operation_id="auth_login")
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier, password, app, remember = (
            serializer.validated_data[k] for k in ("username", "password", "app", "remember")
        )
        user = find_login_user(identifier)
        # Lock the account, not the spelling: username / email / phone share one counter.
        lock_key = f"user:{user.pk}" if user else identifier.strip().lower()
        if lockout.is_locked(lock_key):
            minutes = config.get_int("auth.login_lockout_minutes", 15)
            raise APIError(
                f"Too many failed attempts. Try again in {minutes} minutes.", "account_locked", 429
            )
        if user is None:
            check_password(password, _DUMMY_HASH)  # equalise timing
            valid = False
        else:
            valid = user.check_password(password) and user.is_active
        if not valid:
            locked = lockout.register_failure(lock_key)
            message = (
                "Too many failed attempts. Your account is locked for a few minutes."
                if locked
                else "Wrong username or password."
            )
            raise APIError(
                message,
                "account_locked" if locked else "invalid_credentials",
                429 if locked else 400,
            )
        if app == "admin" and not user.is_staff:
            raise APIError("This account doesn't have staff access.", "not_staff", 403)
        lockout.clear(lock_key)
        return _session_response(request, user, app, persistent=remember)


def find_login_user(identifier: str) -> User | None:
    """Username, or a *verified* email / phone. Unverified contact details never sign anyone in
    (otherwise claiming someone else's address on your own account would be a way in)."""
    from . import phone as phones

    value = identifier.strip()
    if "@" in value:
        return User.objects.filter(email__iexact=value, email_verified_at__isnull=False).first()
    if re.fullmatch(r"[+\d\s()\-.]{7,20}", value) and re.search(
        r"\d{7,}", re.sub(r"\D", "", value)
    ):
        try:
            number = phones.normalize(value)
        except ValueError:
            return None
        return User.objects.filter(phone=number, phone_verified_at__isnull=False).first()
    return User.objects.filter(username__iexact=value).first()


class RefreshView(APIView):
    authentication_classes: list = []

    @extend_schema(request=AppSerializer, responses=SessionSerializer, operation_id="auth_refresh")
    def post(self, request):
        app = AppSerializer(data=request.data)
        app.is_valid(raise_exception=True)
        app_name = app.validated_data["app"]
        raw = request.COOKIES.get(refresh_cookie_name(app_name))
        if not raw:
            raise APIError("Please log in to continue.", "not_authenticated", 401)
        _check_csrf(request, app_name)
        try:
            user, issued = rotate_refresh_token(
                raw,
                app_name,
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                ip=client_ip(request),
            )
        except RefreshError as exc:
            response = Response({"code": exc.code, "message": exc.message}, status=401)
            _clear_cookies(response, app_name)
            return response
        if app_name == "admin" and not user.is_staff:
            raise APIError("This account doesn't have staff access.", "not_staff", 403)
        return _session_response(request, user, app_name, refresh=issued)


class LogoutView(APIView):
    authentication_classes: list = []

    @extend_schema(request=AppSerializer, responses={204: None}, operation_id="auth_logout")
    def post(self, request):
        app = AppSerializer(data=request.data)
        app.is_valid(raise_exception=True)
        app_name = app.validated_data["app"]
        raw = request.COOKIES.get(refresh_cookie_name(app_name))
        if raw:
            _check_csrf(request, app_name)
            revoke_refresh_token(raw)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_cookies(response, app_name)
        return response


class UsernameAvailabilityView(APIView):
    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_username_check")]

    @extend_schema(
        parameters=[OpenApiParameter("username", str, required=True)],
        responses=UsernameAvailabilitySerializer,
        operation_id="auth_username_available",
    )
    def get(self, request):
        username = request.query_params.get("username", "").strip()
        from rest_framework.exceptions import ValidationError

        try:
            validate_username_format(username)
        except ValidationError as exc:
            return Response(
                {"username": username, "available": False, "message": str(exc.detail[0])}
            )
        taken = User.objects.filter(username__iexact=username).exists()
        return Response(
            {
                "username": username,
                "available": not taken,
                "message": "That username is taken." if taken else "",
            }
        )


class MeView(APIView):
    permission_classes = [IsViewer]

    @extend_schema(responses=UserSerializer, operation_id="auth_me")
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(request=UserSerializer, responses=UserSerializer, operation_id="auth_me_update")
    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        mode = serializer.validated_data.get("translation_mode")
        if mode is not None:
            from apps.recommendations.cache import invalidate_user

            invalidate_user(request.user.pk)
        return Response(serializer.data)


class ChangePasswordView(APIView):
    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_login")]

    @extend_schema(
        request=ChangePasswordSerializer,
        responses=SessionSerializer,
        operation_id="auth_change_password",
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user: User = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            raise APIError(
                "That's not your current password.",
                "validation_error",
                400,
                {"current_password": "That's not your current password."},
            )
        user.set_password(serializer.validated_data["new_password"])
        user.token_version += 1
        user.save(update_fields=["password", "token_version"])
        revoke_all_for_user(user)
        app = "admin" if request.data.get("app") == "admin" else "client"
        return _session_response(request, user, app)
