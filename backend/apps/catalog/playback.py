"""Playback session info: signed manifest URLs, markers, resume point, next episode."""

import uuid

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsViewer
from apps.accounts.viewer import viewer_for
from apps.core.config import config
from apps.core.exceptions import APIError
from apps.engagement.models import WatchProgress
from apps.media import delivery
from apps.media.models import VideoAsset
from apps.media.serializers import ImageRef
from apps.recommendations.feed import next_episode

from .models import Episode, Title


class PlaybackEpisodeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    number = serializers.IntegerField()
    name = serializers.CharField()
    season_number = serializers.IntegerField()
    synopsis = serializers.CharField(allow_blank=True)
    intro_start = serializers.FloatField(allow_null=True)
    intro_end = serializers.FloatField(allow_null=True)
    credits_start = serializers.FloatField(allow_null=True)


class NextEpisodeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    label = serializers.CharField()
    name = serializers.CharField()
    synopsis = serializers.CharField(allow_blank=True)
    thumbnail = ImageRef(allow_null=True)


class RenditionInfoSerializer(serializers.Serializer):
    height = serializers.IntegerField()
    width = serializers.IntegerField()
    bandwidth = serializers.IntegerField()


class SubtitleInfoSerializer(serializers.Serializer):
    language = serializers.CharField()
    label = serializers.CharField()
    is_default = serializers.BooleanField()


class PlaybackTitleSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    title = serializers.CharField()
    type = serializers.CharField()
    maturity_rating = serializers.CharField(allow_blank=True)
    logo = ImageRef(allow_null=True)
    backdrop = ImageRef(allow_null=True)


class PlaybackSerializer(serializers.Serializer):
    session_id = serializers.CharField()
    asset_id = serializers.UUIDField()
    master_url = serializers.CharField()
    thumbnails_url = serializers.CharField()
    duration = serializers.FloatField()
    start_at = serializers.FloatField()
    max_height = serializers.IntegerField(allow_null=True)
    title = PlaybackTitleSerializer()
    episode = PlaybackEpisodeSerializer(allow_null=True)
    next = NextEpisodeSerializer(allow_null=True)
    renditions = RenditionInfoSerializer(many=True)
    subtitles = SubtitleInfoSerializer(many=True)
    is_preview = serializers.BooleanField()


def _episode_data(e: Episode) -> dict:
    return {
        "id": e.pk,
        "number": e.number,
        "name": e.name,
        "season_number": e.season.number,
        "synopsis": e.synopsis,
        "intro_start": e.intro_start,
        "intro_end": e.intro_end,
        "credits_start": e.credits_start,
    }


class PlaybackView(APIView):
    permission_classes = [IsViewer]

    @extend_schema(
        parameters=[OpenApiParameter("episode", int), OpenApiParameter("preview", bool)],
        responses=PlaybackSerializer,
        operation_id="playback",
    )
    def get(self, request, slug: str):
        title = get_object_or_404(
            Title.objects.published().select_related("video", "trailer", "logo", "backdrop"),
            slug=slug,
        )
        who = viewer_for(request)
        if (
            who
            and who.kids
            and title.maturity_rating not in (config.get_json("content.kids_ratings") or [])
        ):
            raise APIError("This title isn't available on this profile.", "not_available", 404)
        preview = request.query_params.get("preview") in ("1", "true")
        episode = None
        asset: VideoAsset | None = None
        start_at = 0.0

        if preview:
            if title.trailer_id and title.trailer.is_ready:
                asset = title.trailer
            elif title.is_series:
                episode = (
                    Episode.objects.filter(season__title=title, video__status="ready")
                    .select_related("video", "season")
                    .order_by("season__number", "number")
                    .first()
                )
                asset = episode.video if episode else None
            else:
                asset = title.video if title.video_id and title.video.is_ready else None
            if asset is not None and asset is not title.trailer:
                start_at = round(
                    asset.duration * 0.15, 1
                )  # a representative moment, not the opening logos
            episode = None
        elif title.is_series:
            episode_id = request.query_params.get("episode")
            qs = Episode.objects.filter(season__title=title, video__status="ready").select_related(
                "video", "season", "thumbnail"
            )
            episode = qs.filter(pk=episode_id).first() if episode_id else None
            if episode is None:
                from .views import play_target

                target = play_target(who, title)
                episode = qs.filter(pk=target["episode_id"]).first() if target else None
            asset = episode.video if episode else None
        else:
            asset = title.video if title.video_id and title.video.is_ready else None

        if asset is None or not asset.is_ready:
            raise APIError("This title isn't available to play yet.", "not_available", 404)

        if not preview:
            progress = WatchProgress.objects.filter(
                **who.scope, title=title, episode=episode
            ).first()
            if progress and not progress.completed and progress.position_seconds > 5:
                start_at = progress.position_seconds

        nxt = next_episode(episode) if episode else None
        token = delivery.issue_token(str(asset.pk), request.user.pk)
        max_height = 720 if preview else None
        base = f"/api/v1/stream/{asset.pk}"
        data = {
            "session_id": uuid.uuid4().hex,
            "asset_id": asset.pk,
            "master_url": f"{base}/master.m3u8?t={token}"
            + (f"&max_height={max_height}" if max_height else ""),
            "thumbnails_url": f"{base}/thumbs.vtt?t={token}",
            "duration": asset.duration,
            "start_at": start_at,
            "max_height": max_height,
            "title": {
                "id": title.pk,
                "slug": title.slug,
                "title": title.title,
                "type": title.type,
                "maturity_rating": title.maturity_rating,
                "logo": title.logo,
                "backdrop": title.backdrop,
            },
            "episode": _episode_data(episode) if episode else None,
            "next": (
                {
                    "id": nxt.pk,
                    "label": f"S{nxt.season.number}:E{nxt.number}",
                    "name": nxt.name,
                    "synopsis": nxt.synopsis,
                    "thumbnail": nxt.thumbnail,
                }
                if nxt
                else None
            ),
            "renditions": [
                {"height": r["height"], "width": r["width"], "bandwidth": r["bandwidth"]}
                for r in asset.renditions
            ],
            "subtitles": [
                {"language": s.language, "label": s.label, "is_default": s.is_default}
                for s in asset.subtitles.all()
            ],
            "is_preview": preview,
        }
        response = Response(PlaybackSerializer(data).data)
        response["Cache-Control"] = "private, no-store"
        return response
