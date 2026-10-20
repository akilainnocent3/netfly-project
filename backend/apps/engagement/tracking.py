"""Batched watch-progress and playback analytics ingestion."""

import datetime as dt
import json
import time

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsViewer
from apps.catalog.models import Episode, Title
from apps.core.config import config
from apps.core.redis import get_redis
from apps.core.throttling import throttle
from apps.recommendations.cache import invalidate_user

from .models import ViewEvent, WatchProgress

EVENT_BUFFER = "events:buffer"
PRESENCE_PREFIX = "presence:"


class ProgressUpdateSerializer(serializers.Serializer):
    title_id = serializers.IntegerField()
    episode_id = serializers.IntegerField(required=False, allow_null=True)
    position = serializers.FloatField(min_value=0)
    duration = serializers.FloatField(min_value=0)
    watched = serializers.FloatField(
        min_value=0, max_value=3600, default=0, help_text="Seconds watched since the last update."
    )


class ProgressBatchSerializer(serializers.Serializer):
    updates = ProgressUpdateSerializer(many=True, max_length=50)


class ProgressResultSerializer(serializers.Serializer):
    saved = serializers.IntegerField()
    completed = serializers.ListField(child=serializers.IntegerField())


class EventSerializer(serializers.Serializer):
    session_id = serializers.CharField(max_length=40)
    kind = serializers.ChoiceField(choices=ViewEvent.Kind.choices)
    title_id = serializers.IntegerField(required=False, allow_null=True)
    episode_id = serializers.IntegerField(required=False, allow_null=True)
    position = serializers.FloatField(default=0)
    value = serializers.FloatField(required=False, allow_null=True)
    data = serializers.DictField(required=False)
    ts = serializers.DateTimeField(required=False)


class EventBatchSerializer(serializers.Serializer):
    events = EventSerializer(many=True, max_length=200)


class ProgressView(APIView):
    """Saves position for one or more items (the player calls this every N seconds and on pause/exit)."""

    permission_classes = [IsViewer]

    @extend_schema(
        request=ProgressBatchSerializer,
        responses=ProgressResultSerializer,
        operation_id="playback_progress",
    )
    def post(self, request):
        data = ProgressBatchSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        ratio = config.get_float("playback.completed_ratio", 0.92)
        completed_now: list[int] = []
        saved = 0
        for update in data.validated_data["updates"]:
            title = Title.objects.filter(pk=update["title_id"]).only("pk", "type").first()
            if title is None:
                continue
            episode = None
            if update.get("episode_id"):
                episode = Episode.objects.filter(
                    pk=update["episode_id"], season__title=title
                ).first()
                if episode is None:
                    continue
            duration = update["duration"]
            position = min(update["position"], duration) if duration else update["position"]
            done = bool(duration) and position / duration >= ratio
            with transaction.atomic():
                progress, _ = WatchProgress.objects.select_for_update().get_or_create(
                    user=request.user,
                    profile=None,
                    title=title,
                    episode=episode,
                )
                was_completed = progress.completed
                progress.position_seconds = 0 if done else position
                progress.duration_seconds = duration
                progress.watch_seconds += update["watched"]
                # Rewatching from the start reopens a finished item.
                progress.completed = done or (was_completed and position < duration * 0.05)
                progress.save()
            saved += 1
            if done and not was_completed:
                completed_now.append(title.pk)
        if completed_now:
            invalidate_user(request.user.pk)
        return Response({"saved": saved, "completed": completed_now})


class EventsView(APIView):
    """Playback analytics in batches. Buffered in Redis, bulk-inserted by a periodic task."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_events", per_user=True)]

    @extend_schema(
        request=EventBatchSerializer, responses={202: None}, operation_id="playback_events"
    )
    def post(self, request):
        data = EventBatchSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        now = timezone.now()
        rows = []
        for e in data.validated_data["events"]:
            rows.append(
                json.dumps(
                    {
                        "u": request.user.pk,
                        "t": e.get("title_id"),
                        "e": e.get("episode_id"),
                        "s": e["session_id"],
                        "k": e["kind"],
                        "p": e["position"],
                        "v": e.get("value"),
                        "d": e.get("data") or {},
                        "ts": (e.get("ts") or now).isoformat(),
                        "at": now.isoformat(),
                    }
                )
            )
        if rows:
            get_redis().rpush(EVENT_BUFFER, *rows)
        # Presence for "active viewers now" (expires on its own).
        cache.set(f"{PRESENCE_PREFIX}{request.user.pk}", int(time.time()), 90)
        return Response(status=202)


def flush_buffer(max_rows: int = 5000) -> int:
    redis = get_redis()
    pipe = redis.pipeline()
    pipe.lrange(EVENT_BUFFER, 0, max_rows - 1)
    pipe.ltrim(EVENT_BUFFER, max_rows, -1)
    raw, _ = pipe.execute()
    objs = []
    for item in raw:
        try:
            e = json.loads(item)
            objs.append(
                ViewEvent(
                    user_id=e["u"],
                    title_id=e["t"],
                    episode_id=e["e"],
                    session_id=e["s"][:40],
                    kind=e["k"],
                    position=e["p"] or 0,
                    value=e["v"],
                    data=e["d"],
                    client_ts=dt.datetime.fromisoformat(e["ts"]),
                    created_at=dt.datetime.fromisoformat(e["at"]),
                )
            )
        except (ValueError, KeyError, TypeError):
            continue
    ViewEvent.objects.bulk_create(objs, batch_size=1000)
    return len(objs)


def active_viewers() -> int:
    return sum(1 for _ in get_redis().scan_iter(match=f"*{PRESENCE_PREFIX}*", count=1000))
