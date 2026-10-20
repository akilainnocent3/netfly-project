"""Admin: dashboard analytics, viewers, staff & roles, audit log."""

import datetime as dt
import secrets

from django.core.cache import cache
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import StaffPermission, SuperadminOnly
from apps.accounts.serializers import validate_password_length, validate_username_format
from apps.accounts.tokens import revoke_all_for_user
from apps.catalog.models import Title
from apps.core import storage
from apps.core.models import AuditLog
from apps.engagement.models import Rating, ViewEvent, WatchProgress
from apps.engagement.tracking import active_viewers
from apps.media.models import VideoAsset

from .config_views import AuditLogSerializer
from .mixins import AdminPagination, AuditedMixin

R = User.Role
RANGES = {"today": 1, "7d": 7, "30d": 30, "90d": 90}


# -- dashboard ---------------------------------------------------------------------
class SeriesPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    plays = serializers.IntegerField()
    viewers = serializers.IntegerField()
    startup_ms = serializers.FloatField(allow_null=True)
    rebuffers_per_play = serializers.FloatField(allow_null=True)
    signups = serializers.IntegerField()


class TopTitleSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    plays = serializers.IntegerField()
    viewers = serializers.IntegerField()


class DashboardSerializer(serializers.Serializer):
    range = serializers.CharField()
    active_viewers = serializers.IntegerField()
    plays_today = serializers.IntegerField()
    plays_7d = serializers.IntegerField()
    plays_30d = serializers.IntegerField()
    avg_startup_ms = serializers.FloatField(allow_null=True)
    rebuffer_ratio = serializers.FloatField(
        allow_null=True, help_text="Share of plays with at least one rebuffer."
    )
    rebuffers_per_hour = serializers.FloatField(allow_null=True)
    watch_hours = serializers.FloatField()
    viewers_total = serializers.IntegerField()
    titles_published = serializers.IntegerField()
    transcoding = serializers.DictField(child=serializers.IntegerField())
    storage_bytes = serializers.IntegerField(allow_null=True)
    quality_mix = serializers.DictField(child=serializers.IntegerField())
    series = SeriesPointSerializer(many=True)
    top_titles = TopTitleSerializer(many=True)


def _storage_bytes() -> int | None:
    value = cache.get("dash:storage")
    if value is None:
        try:
            value = storage.usage_bytes() if storage.is_configured() else -1
        except Exception:  # noqa: BLE001 - dashboard must render even if S3 listing is denied
            value = -1
        cache.set("dash:storage", value, 900)
    return None if value < 0 else value


class DashboardView(APIView):
    permission_classes = [StaffPermission]
    read_roles = (R.CONTENT_MANAGER, R.ANALYST)

    @extend_schema(
        parameters=[OpenApiParameter("range", str, enum=list(RANGES))],
        responses=DashboardSerializer,
        operation_id="admin_dashboard",
    )
    def get(self, request):
        key = request.query_params.get("range", "7d")
        days = RANGES.get(key, 7)
        now = timezone.now()
        since = now - dt.timedelta(days=days)
        start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        starts = ViewEvent.objects.filter(kind=ViewEvent.Kind.START)

        def plays_since(when):
            return starts.filter(created_at__gte=when).count()

        window = ViewEvent.objects.filter(created_at__gte=since)
        play_count = window.filter(kind=ViewEvent.Kind.START).count()
        sessions_with_rebuffer = (
            window.filter(kind=ViewEvent.Kind.REBUFFER).values("session_id").distinct().count()
        )
        rebuffer_count = window.filter(kind=ViewEvent.Kind.REBUFFER).count()
        watch_seconds = (
            WatchProgress.objects.filter(updated_at__gte=since).aggregate(s=Sum("watch_seconds"))[
                "s"
            ]
            or 0
        )

        per_day = {
            row["d"]: row
            for row in window.annotate(d=TruncDate("created_at"))
            .values("d")
            .annotate(
                plays=Count("id", filter=Q(kind=ViewEvent.Kind.START)),
                viewers=Count("user_id", distinct=True),
                startup=Avg("value", filter=Q(kind=ViewEvent.Kind.START)),
                rebuffers=Count("id", filter=Q(kind=ViewEvent.Kind.REBUFFER)),
            )
        }
        signups = dict(
            User.objects.filter(created_at__gte=since)
            .annotate(d=TruncDate("created_at"))
            .values("d")
            .annotate(n=Count("id"))
            .values_list("d", "n")
        )
        series = []
        for i in range(days - 1, -1, -1):
            day = (now - dt.timedelta(days=i)).date()
            row = per_day.get(day, {})
            plays = row.get("plays", 0)
            series.append(
                {
                    "date": day,
                    "plays": plays,
                    "viewers": row.get("viewers", 0),
                    "startup_ms": round(row["startup"], 1) if row.get("startup") else None,
                    "rebuffers_per_play": (
                        round(row.get("rebuffers", 0) / plays, 3) if plays else None
                    ),
                    "signups": signups.get(day, 0),
                }
            )

        top = list(
            starts.filter(created_at__gte=since, title_id__isnull=False)
            .values("title_id")
            .annotate(plays=Count("id"), viewers=Count("user_id", distinct=True))
            .order_by("-plays")[:10]
        )
        names = dict(
            Title.objects.filter(pk__in=[t["title_id"] for t in top]).values_list("pk", "title")
        )
        quality = dict(
            window.filter(kind=ViewEvent.Kind.QUALITY)
            .values_list("data__height")
            .annotate(n=Count("id"))
            .order_by()
        )
        return Response(
            {
                "range": key,
                "active_viewers": active_viewers(),
                "plays_today": plays_since(start_of_today),
                "plays_7d": plays_since(now - dt.timedelta(days=7)),
                "plays_30d": plays_since(now - dt.timedelta(days=30)),
                "avg_startup_ms": window.filter(kind=ViewEvent.Kind.START).aggregate(
                    a=Avg("value")
                )["a"],
                "rebuffer_ratio": (
                    round(sessions_with_rebuffer / play_count, 4) if play_count else None
                ),
                "rebuffers_per_hour": (
                    round(rebuffer_count / (watch_seconds / 3600), 3)
                    if watch_seconds > 60
                    else None
                ),
                "watch_hours": round(watch_seconds / 3600, 1),
                "viewers_total": User.objects.filter(is_staff=False).count(),
                "titles_published": Title.objects.published().count(),
                "transcoding": {
                    k: v
                    for k, v in VideoAsset.objects.values_list("status")
                    .annotate(n=Count("id"))
                    .order_by()
                },
                "storage_bytes": _storage_bytes(),
                "quality_mix": {f"{int(k)}p" if k else "unknown": v for k, v in quality.items()},
                "series": series,
                "top_titles": [
                    {
                        "id": t["title_id"],
                        "title": names.get(t["title_id"], "—"),
                        "plays": t["plays"],
                        "viewers": t["viewers"],
                    }
                    for t in top
                ],
            }
        )


# -- viewers ------------------------------------------------------------------------
class AdminUserSerializer(serializers.ModelSerializer):
    watch_count = serializers.IntegerField(read_only=True)
    rating_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "full_name",
            "is_active",
            "is_staff",
            "role",
            "created_at",
            "last_seen",
            "translation_mode",
            "watch_count",
            "rating_count",
        ]
        read_only_fields = fields


class HistoryItemSerializer(serializers.Serializer):
    title_id = serializers.IntegerField()
    title = serializers.CharField()
    episode = serializers.CharField(allow_null=True)
    progress = serializers.FloatField()
    completed = serializers.BooleanField()
    updated_at = serializers.DateTimeField()


class RatingItemSerializer(serializers.Serializer):
    title_id = serializers.IntegerField()
    title = serializers.CharField()
    value = serializers.IntegerField()
    updated_at = serializers.DateTimeField()


class UserDetailSerializer(serializers.Serializer):
    user = AdminUserSerializer()
    history = HistoryItemSerializer(many=True)
    ratings = RatingItemSerializer(many=True)


class ResetPasswordResultSerializer(serializers.Serializer):
    temporary_password = serializers.CharField()


class UserViewSet(AuditedMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Viewers: search, history, ratings, disable, reset password."""

    audit_type = "user"
    serializer_class = AdminUserSerializer
    pagination_class = AdminPagination
    read_roles = (R.CONTENT_MANAGER, R.ANALYST)
    write_roles = (R.CONTENT_MANAGER,)

    def get_queryset(self):
        qs = User.objects.annotate(
            watch_count=Count("progress", distinct=True),
            rating_count=Count("ratings", distinct=True),
        ).order_by("-created_at")
        if q := self.request.query_params.get("search", "").strip():
            qs = qs.filter(Q(username__icontains=q) | Q(full_name__icontains=q))
        if self.request.query_params.get("staff") == "true":
            qs = qs.filter(is_staff=True)
        return qs

    @extend_schema(parameters=[OpenApiParameter("search", str), OpenApiParameter("staff", bool)])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(responses=UserDetailSerializer)
    def retrieve(self, request, pk=None):
        user = self.get_object()
        history = [
            {
                "title_id": p.title_id,
                "title": p.title.title,
                "episode": (
                    f"S{p.episode.season.number}:E{p.episode.number} {p.episode.name}"
                    if p.episode_id
                    else None
                ),
                "progress": round(p.fraction, 3),
                "completed": p.completed,
                "updated_at": p.updated_at,
            }
            for p in WatchProgress.objects.filter(user=user)
            .select_related("title", "episode__season")
            .order_by("-updated_at")[:50]
        ]
        ratings = [
            {
                "title_id": r.title_id,
                "title": r.title.title,
                "value": r.value,
                "updated_at": r.updated_at,
            }
            for r in Rating.objects.filter(user=user)
            .select_related("title")
            .order_by("-updated_at")[:50]
        ]
        return Response(
            {"user": AdminUserSerializer(user).data, "history": history, "ratings": ratings}
        )

    def _guard(self, user):
        if user.pk == self.request.user.pk:
            from apps.core.exceptions import APIError

            raise APIError("You can't do that to your own account.", "self_action", 400)
        if user.role == R.SUPERADMIN and self.request.user.role != R.SUPERADMIN:
            from apps.core.exceptions import APIError

            raise APIError("Only a superadmin can change another superadmin.", "forbidden", 403)

    @extend_schema(request=None, responses=AdminUserSerializer)
    @action(detail=True, methods=["post"])
    def disable(self, request, pk=None):
        user = self.get_object()
        self._guard(user)
        user.is_active = False
        user.token_version += 1
        user.save(update_fields=["is_active", "token_version"])
        revoke_all_for_user(user)
        self._audit("disable", user)
        return Response(AdminUserSerializer(self.get_queryset().get(pk=user.pk)).data)

    @extend_schema(request=None, responses=AdminUserSerializer)
    @action(detail=True, methods=["post"])
    def enable(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        self._audit("enable", user)
        return Response(AdminUserSerializer(self.get_queryset().get(pk=user.pk)).data)

    @extend_schema(request=None, responses=ResetPasswordResultSerializer)
    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        """Sets a one-time temporary password (shown once, never stored in plain text) and signs the user out."""
        user = self.get_object()
        self._guard(user)
        temporary = "-".join(secrets.token_urlsafe(4) for _ in range(3))
        user.set_password(temporary)
        user.token_version += 1
        user.save(update_fields=["password", "token_version"])
        revoke_all_for_user(user)
        self._audit("reset_password", user, {"password": "reset"})
        return Response({"temporary_password": temporary})


# -- staff & roles ---------------------------------------------------------------------
class StaffInputSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=30)
    full_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=R.choices)
    password = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False)

    def validate_username(self, value):
        return validate_username_format(value)

    def validate_password(self, value):
        return validate_password_length(value) if value else value


class RoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=R.choices)


class StaffViewSet(AuditedMixin, viewsets.GenericViewSet):
    audit_type = "staff"
    permission_classes = [SuperadminOnly]
    serializer_class = AdminUserSerializer
    pagination_class = None

    def get_queryset(self):
        return (
            User.objects.filter(is_staff=True)
            .annotate(
                watch_count=Count("progress", distinct=True),
                rating_count=Count("ratings", distinct=True),
            )
            .order_by("username")
        )

    @extend_schema(responses=AdminUserSerializer(many=True))
    def list(self, request):
        return Response(AdminUserSerializer(self.get_queryset(), many=True).data)

    @extend_schema(request=StaffInputSerializer, responses={201: AdminUserSerializer})
    def create(self, request):
        """Promote an existing account, or create a new staff account with a password."""
        data = StaffInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        user = User.objects.filter(username__iexact=v["username"]).first()
        if user is None:
            if not v.get("password"):
                from apps.core.exceptions import APIError

                raise APIError(
                    "Set a password for the new staff account.",
                    "validation_error",
                    400,
                    {"password": "Required for new accounts."},
                )
            user = User.objects.create_user(
                v["username"], v["password"], full_name=v.get("full_name") or v["username"]
            )
        user.is_staff = True
        user.role = v["role"]
        user.save(update_fields=["is_staff", "role"])
        self._audit("grant", user, {"role": user.role})
        return Response(
            AdminUserSerializer(self.get_queryset().get(pk=user.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=RoleSerializer, responses=AdminUserSerializer)
    def partial_update(self, request, pk=None):
        user = self.get_queryset().get(pk=pk)
        data = RoleSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if user.pk == request.user.pk and data.validated_data["role"] != R.SUPERADMIN:
            from apps.core.exceptions import APIError

            raise APIError("You can't demote yourself.", "self_action", 400)
        old = user.role
        user.role = data.validated_data["role"]
        user.save(update_fields=["role"])
        self._audit("role_change", user, {"role": {"old": old, "new": user.role}})
        return Response(AdminUserSerializer(self.get_queryset().get(pk=user.pk)).data)

    @extend_schema(responses={204: None})
    def destroy(self, request, pk=None):
        user = self.get_queryset().get(pk=pk)
        if user.pk == request.user.pk:
            from apps.core.exceptions import APIError

            raise APIError("You can't remove your own staff access.", "self_action", 400)
        user.is_staff = False
        user.role = ""
        user.token_version += 1
        user.save(update_fields=["is_staff", "role", "token_version"])
        self._audit("revoke", user)
        return Response(status=204)


# -- audit log ---------------------------------------------------------------------------
class AuditLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [SuperadminOnly]
    serializer_class = AuditLogSerializer
    pagination_class = AdminPagination

    def get_queryset(self):
        qs = AuditLog.objects.select_related("actor")
        p = self.request.query_params
        if actor := p.get("actor"):
            qs = qs.filter(actor__username__iexact=actor)
        if action_ := p.get("action"):
            qs = qs.filter(action__startswith=action_)
        if target := p.get("target_type"):
            qs = qs.filter(target_type=target)
        if q := p.get("search"):
            qs = qs.filter(Q(target_repr__icontains=q) | Q(action__icontains=q))
        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter("actor", str),
            OpenApiParameter("action", str),
            OpenApiParameter("target_type", str),
            OpenApiParameter("search", str),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)
