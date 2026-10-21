"""Viewer API: verify an email / phone (needed only for paid plans and free trials), and reset a
forgotten password with a code sent to a verified email or phone."""

from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import client_ip
from apps.core.exceptions import APIError
from apps.core.throttling import throttle

from . import verification as v
from .models import VerificationCode
from .permissions import IsViewer
from .serializers import SessionSerializer, UserSerializer, validate_password_length

CHANNELS = [c.value for c in VerificationCode.Channel]


class CodeSentSerializer(serializers.Serializer):
    channel = serializers.ChoiceField(choices=CHANNELS)
    target = serializers.CharField()
    sent_to = serializers.CharField()
    expires_in = serializers.IntegerField()
    resend_in = serializers.IntegerField()
    length = serializers.IntegerField()
    network = serializers.CharField(allow_null=True)


class ContactSerializer(serializers.Serializer):
    value = serializers.CharField(allow_null=True)
    verified = serializers.BooleanField()
    pending = CodeSentSerializer(allow_null=True)


class VerifyStatusSerializer(serializers.Serializer):
    email = ContactSerializer()
    phone = ContactSerializer()


class StartSerializer(serializers.Serializer):
    value = serializers.CharField(max_length=254)


class ConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=12)


class VerifiedSerializer(serializers.Serializer):
    channel = serializers.ChoiceField(choices=CHANNELS)
    user = UserSerializer()


def _raise(exc: v.VerificationError):
    raise APIError(
        exc.message,
        exc.code,
        exc.status,
        fields={exc.field: exc.message} if exc.field else None,
        extra=exc.extra,
    ) from exc


def _channel(value: str) -> str:
    if value not in CHANNELS:
        raise APIError("Unknown channel.", "not_found", 404)
    return value


def _host(request) -> str:
    return request.META.get("HTTP_X_FORWARDED_HOST") or request.get_host()


class VerifyStatusView(APIView):
    permission_classes = [IsViewer]

    @extend_schema(responses=VerifyStatusSerializer, operation_id="verify_status")
    def get(self, request):
        user = request.user
        data = {
            "email": {
                "value": user.email,
                "verified": user.email_verified,
                "pending": v.pending(user, "email"),
            },
            "phone": {
                "value": user.phone,
                "verified": user.phone_verified,
                "pending": v.pending(user, "phone"),
            },
        }
        response = Response(data)
        response["Cache-Control"] = "private, no-store"
        return response


class VerifyStartView(APIView):
    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_otp_send")]

    @extend_schema(
        request=StartSerializer, responses=CodeSentSerializer, operation_id="verify_start"
    )
    def post(self, request, channel: str):
        channel = _channel(channel)
        data = StartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            sent = v.start(
                request.user,
                channel,
                data.validated_data["value"],
                ip=client_ip(request),
                host=_host(request),
            )
        except v.VerificationError as exc:
            _raise(exc)
        return Response(sent, status=201)


class VerifyConfirmView(APIView):
    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_otp_check", per_user=True)]

    @extend_schema(
        request=ConfirmSerializer, responses=VerifiedSerializer, operation_id="verify_confirm"
    )
    def post(self, request, channel: str):
        channel = _channel(channel)
        data = ConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            user = v.confirm(
                request.user, channel, data.validated_data["code"], ip=client_ip(request)
            )
        except v.VerificationError as exc:
            _raise(exc)
        return Response({"channel": channel, "user": UserSerializer(user).data})


# -- forgot password ---------------------------------------------------------------------------
class ResetStartSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)


class ResetStartResultSerializer(serializers.Serializer):
    reset_token = serializers.CharField()
    message = serializers.CharField()


class ResetConfirmSerializer(serializers.Serializer):
    reset_token = serializers.CharField(max_length=64)
    code = serializers.CharField(max_length=12)
    new_password = serializers.CharField(trim_whitespace=False)
    app = serializers.ChoiceField(choices=["client", "admin"], default="client")

    def validate_new_password(self, value: str) -> str:
        return validate_password_length(value)


class PasswordResetStartView(APIView):
    """Same answer whether or not the account exists (no account enumeration)."""

    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_otp_send")]

    @extend_schema(
        request=ResetStartSerializer,
        responses=ResetStartResultSerializer,
        operation_id="auth_password_reset_start",
    )
    def post(self, request):
        data = ResetStartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            token = v.reset_start(
                data.validated_data["identifier"], ip=client_ip(request), host=_host(request)
            )
        except v.VerificationError as exc:
            _raise(exc)
        return Response(
            {
                "reset_token": token,
                "message": "If that account has a verified email or phone number, we've sent it "
                "a code.",
            }
        )


class PasswordResetConfirmView(APIView):
    """A correct code sets the new password, signs out every device and signs this one in."""

    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_otp_check")]

    @extend_schema(
        request=ResetConfirmSerializer,
        responses=SessionSerializer,
        operation_id="auth_password_reset_confirm",
    )
    def post(self, request):
        from .views import _session_response

        data = ResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        d = data.validated_data
        try:
            user = v.reset_confirm(
                d["reset_token"], d["code"], d["new_password"], ip=client_ip(request)
            )
        except v.VerificationError as exc:
            _raise(exc)
        if d["app"] == "admin" and not user.is_staff:
            raise APIError("This account doesn't have staff access.", "not_staff", 403)
        return _session_response(request, user, d["app"])
