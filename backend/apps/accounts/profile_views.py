"""Viewer profiles (behind `features.profiles_enabled`). Always scoped to request.user."""

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.config import config
from apps.core.exceptions import APIError
from apps.core.throttling import throttle

from .models import User, ViewerProfile
from .permissions import IsViewer
from .viewer import profiles_enabled

# Preset avatars rendered by the client (no uploads → nothing to moderate or sign).
AVATARS = [f"avatar-{i}" for i in range(1, 13)]


class ProfileSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=40, trim_whitespace=True)
    avatar_key = serializers.ChoiceField(choices=AVATARS, required=False)
    translation_mode = serializers.ChoiceField(
        choices=User.TranslationMode.choices, required=False, allow_blank=True
    )

    class Meta:
        model = ViewerProfile
        fields = ["id", "name", "avatar_key", "is_kids", "translation_mode", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_name(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("Give the profile a name.")
        user = self.context["request"].user
        clash = ViewerProfile.objects.filter(user=user, name__iexact=value.strip())
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("You already have a profile with that name.")
        return value.strip()


def adopt_account_history(user_id: int, profile_id: int) -> None:
    """The first profile inherits the account-level history (progress, ratings, list,
    reminders) recorded before profiles were turned on, so nobody starts from scratch."""
    from apps.engagement.models import MyListItem, Rating, Reminder, WatchProgress
    from apps.recommendations.cache import invalidate_user

    for model in (WatchProgress, Rating, MyListItem, Reminder):
        model.objects.filter(user_id=user_id, profile__isnull=True).update(profile_id=profile_id)
    invalidate_user(f"{user_id}.{profile_id}")


class ProfileListSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    max_profiles = serializers.IntegerField()
    avatars = serializers.ListField(child=serializers.CharField())
    results = ProfileSerializer(many=True)


def _require_enabled() -> None:
    if not profiles_enabled():
        raise APIError("Profiles aren't turned on.", "profiles_disabled", 404)


class ProfilesView(APIView):
    permission_classes = [IsViewer]

    def get_throttles(self):
        if self.request.method == "GET":
            return []
        return [throttle("security.rate_profiles", per_user=True)()]

    @extend_schema(responses=ProfileListSerializer, operation_id="profiles_list")
    def get(self, request):
        enabled = profiles_enabled()
        profiles = (
            ViewerProfile.objects.filter(user=request.user).order_by("created_at", "pk")
            if enabled
            else ViewerProfile.objects.none()
        )
        return Response(
            {
                "enabled": enabled,
                "max_profiles": config.get_int("features.max_profiles", 5),
                "avatars": AVATARS,
                "results": ProfileSerializer(profiles, many=True).data,
            }
        )

    @extend_schema(
        request=ProfileSerializer,
        responses={201: ProfileSerializer},
        operation_id="profiles_create",
    )
    def post(self, request):
        _require_enabled()
        data = ProfileSerializer(data=request.data, context={"request": request})
        data.is_valid(raise_exception=True)
        limit = config.get_int("features.max_profiles", 5)
        with transaction.atomic():
            # Lock the account row so two concurrent creates can't both pass the limit.
            type(request.user).objects.select_for_update().filter(pk=request.user.pk).first()
            if ViewerProfile.objects.filter(user=request.user).count() >= limit:
                raise APIError(f"An account can have up to {limit} profiles.", "profile_limit", 400)
            first = not ViewerProfile.objects.filter(user=request.user).exists()
            try:
                profile = data.save(
                    user=request.user,
                    avatar_key=data.validated_data.get("avatar_key") or AVATARS[0],
                )
            except IntegrityError as exc:
                raise APIError(
                    "You already have a profile with that name.", "profile_exists", 400
                ) from exc
            if first:
                adopt_account_history(request.user.pk, profile.pk)
        return Response(ProfileSerializer(profile).data, status=201)


class ProfileDetailView(APIView):
    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_profiles", per_user=True)]

    def _get(self, request, pk: int) -> ViewerProfile:
        _require_enabled()
        return get_object_or_404(ViewerProfile, pk=pk, user=request.user)

    @extend_schema(
        request=ProfileSerializer, responses=ProfileSerializer, operation_id="profiles_update"
    )
    def patch(self, request, pk: int):
        profile = self._get(request, pk)
        data = ProfileSerializer(
            profile, data=request.data, partial=True, context={"request": request}
        )
        data.is_valid(raise_exception=True)
        data.save()
        return Response(ProfileSerializer(profile).data)

    @extend_schema(responses={204: None}, operation_id="profiles_delete")
    def delete(self, request, pk: int):
        profile = self._get(request, pk)
        if ViewerProfile.objects.filter(user=request.user).count() <= 1:
            raise APIError("Keep at least one profile.", "profile_last", 400)
        profile.delete()  # its progress, ratings, list and reminders cascade
        return Response(status=204)
