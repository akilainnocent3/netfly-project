"""Card badges: Top 10 → Leaving soon → New episodes → Recently added.

Each badge has its own window (Studio → Settings → Content). Badges are computed from the clock
on every request, so one disappears exactly when its window ends; `seconds_until_change()` lets
cached responses (and the public HTTP cache) expire no later than the next badge change.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from django.core.cache import cache
from django.db.models import Max
from django.utils import timezone

from apps.core.config import config

BADGES = ["top10", "new_episodes", "recently_added", "leaving_soon"]
LEGACY_DAYS = "content.badge_days"  # read as a fallback for one release (see migration 0004)


@dataclass(frozen=True)
class Windows:
    recently_added: dt.timedelta
    new_episodes: dt.timedelta
    leaving_soon: dt.timedelta


def windows() -> Windows:
    """The three windows. A key that was never stored falls back to the old shared
    `content.badge_days` (when that was stored), then to the registry default."""
    legacy = config.get_int(LEGACY_DAYS, 14) if config.is_set(LEGACY_DAYS) else None

    def hours(key: str) -> dt.timedelta:
        if not config.is_set(key) and legacy is not None:
            return dt.timedelta(days=legacy)
        return dt.timedelta(hours=config.get_int(key, 168))

    leaving = (
        config.get_int("content.leaving_soon_days", 14)
        if config.is_set("content.leaving_soon_days") or legacy is None
        else legacy
    )
    return Windows(
        recently_added=hours("content.recently_added_hours"),
        new_episodes=hours("content.new_episodes_hours"),
        leaving_soon=dt.timedelta(days=leaving),
    )


def card_badge(obj, top10: dict, now: dt.datetime | None = None) -> str | None:
    """One badge per card, most important first."""
    from .models import Title

    if obj.pk in top10:
        return "top10"
    now = now or timezone.now()
    w = windows()
    if obj.license_end and now < obj.license_end <= now + w.leaving_soon:
        return "leaving_soon"
    latest = getattr(obj, "latest_episode_at", None)
    published = obj.published_at
    if (
        obj.type == Title.Type.SERIES
        and latest
        and latest > now - w.new_episodes
        and published
        and published <= now - w.recently_added
    ):
        return "new_episodes"
    if published and now - w.recently_added < published <= now:
        return "recently_added"
    return None


def _next_change(now: dt.datetime) -> dt.datetime | None:
    """The soonest moment a visible title's badge appears or ends."""
    from .queries import visible_titles

    w = windows()
    visible = visible_titles("all")
    moments = []
    published = (
        visible.filter(published_at__gt=now - w.recently_added)
        .order_by("published_at")
        .values_list("published_at", flat=True)
        .first()
    )
    if published:
        moments.append(published + w.recently_added)
    latest = (
        visible.filter(type="series")
        .annotate(latest=Max("seasons__episodes__created_at"))
        .filter(latest__gt=now - w.new_episodes)
        .order_by("latest")
        .values_list("latest", flat=True)
        .first()
    )
    if latest:
        moments.append(latest + w.new_episodes)
    leaving = (
        visible.filter(license_end__gt=now + w.leaving_soon)
        .order_by("license_end")
        .values_list("license_end", flat=True)
        .first()
    )
    if leaving:
        moments.append(leaving - w.leaving_soon)  # the badge appears
    return min(moments) if moments else None


def seconds_until_change(now: dt.datetime | None = None) -> int | None:
    """Seconds until some badge changes (None: none will). Cached under the catalog and config
    versions, as an absolute time, so every reader computes its own remaining seconds."""
    from apps.recommendations.cache import catalog_version

    now = now or timezone.now()
    w = windows()
    key = (
        f"badges:next:{catalog_version()}:"
        f"{int(w.recently_added.total_seconds())}:{int(w.new_episodes.total_seconds())}:"
        f"{int(w.leaving_soon.total_seconds())}"
    )
    at = cache.get(key)
    if at is None or (at and at <= now.timestamp()):
        moment = _next_change(now)
        at = moment.timestamp() if moment else 0
        cache.set(key, at, 300)
    if not at:
        return None
    return max(1, int(at - now.timestamp()) + 1)


def cap(seconds: int) -> int:
    """`seconds`, or less if a badge changes sooner."""
    if seconds <= 0:
        return seconds
    left = seconds_until_change()
    return seconds if left is None else max(1, min(seconds, left))
