"""Badge windows: exact expiry, separate windows per badge, the old key's fallback, caches."""

import datetime as dt

import pytest
from django.utils import timezone

from apps.catalog import badges
from apps.catalog.queries import cards_by_ids
from apps.catalog.serializers import TitleCardSerializer
from apps.core.config import config
from apps.core.models import ConfigEntry
from tests.factories import EpisodeFactory, SeasonFactory, SeriesFactory, TitleFactory

pytestmark = pytest.mark.django_db
MINUTE = dt.timedelta(minutes=1)


def badge(title) -> str | None:
    card = cards_by_ids([title.pk])[0]
    return TitleCardSerializer(card, context={"badges": {"top10": {}}}).data["badge"]


@pytest.mark.parametrize("hours", [1, 168, 2160])
def test_recently_added_ends_exactly_when_its_window_does(hours):
    config.set("content.recently_added_hours", hours)
    window = dt.timedelta(hours=hours)
    now = timezone.now()
    inside = TitleFactory(published_at=now - window + MINUTE)
    outside = TitleFactory(published_at=now - window - MINUTE)
    assert badge(inside) == "recently_added"
    assert badge(outside) is None


def test_new_episodes_has_its_own_window():
    config.set("content.recently_added_hours", 24)
    config.set("content.new_episodes_hours", 72)
    now = timezone.now()
    series = SeriesFactory(published_at=now - dt.timedelta(days=30))
    episode = EpisodeFactory(season=SeasonFactory(title=series, number=1), number=1)
    type(episode).objects.filter(pk=episode.pk).update(
        created_at=now - dt.timedelta(hours=72) + MINUTE
    )
    assert badge(series) == "new_episodes"
    type(episode).objects.filter(pk=episode.pk).update(
        created_at=now - dt.timedelta(hours=72) - MINUTE
    )
    assert badge(series) is None
    # A brand-new series says "Recently added", not "New episodes".
    fresh = SeriesFactory(published_at=now - dt.timedelta(hours=2))
    EpisodeFactory(season=SeasonFactory(title=fresh, number=1), number=1)
    assert badge(fresh) == "recently_added"


def test_leaving_soon_has_its_own_window():
    config.set("content.leaving_soon_days", 3)
    now = timezone.now()
    old = now - dt.timedelta(days=90)
    soon = TitleFactory(published_at=old, license_end=now + dt.timedelta(days=3) - MINUTE)
    later = TitleFactory(published_at=old, license_end=now + dt.timedelta(days=3) + MINUTE)
    assert badge(soon) == "leaving_soon"
    assert badge(later) is None


def test_the_old_shared_key_is_a_fallback_for_one_release():
    ConfigEntry.objects.filter(
        key__in=[
            "content.recently_added_hours",
            "content.new_episodes_hours",
            "content.leaving_soon_days",
        ]
    ).delete()
    config.set("content.badge_days", 3)
    w = badges.windows()
    assert w.recently_added == w.new_episodes == w.leaving_soon == dt.timedelta(days=3)
    from django.core.management import call_command

    call_command("seed_config", verbosity=0)  # the next deploy creates the keys…
    config.invalidate()
    config.set("content.recently_added_hours", 10)  # …and the operator sets one
    ConfigEntry.objects.filter(key="content.leaving_soon_days").update(value=None)
    config.invalidate()
    assert badges.windows().recently_added == dt.timedelta(hours=10)
    assert badges.windows().leaving_soon == dt.timedelta(days=3)


@pytest.mark.parametrize(("old_days", "expected"), [(14, (168, 168, 14)), (30, (720, 720, 30))])
def test_migration_seeds_the_new_keys_from_the_old_one(old_days, expected):
    import importlib

    from django.apps import apps

    migration = importlib.import_module("apps.core.migrations.0004_split_badge_windows")
    keys = [
        "content.recently_added_hours",
        "content.new_episodes_hours",
        "content.leaving_soon_days",
    ]
    ConfigEntry.objects.filter(key__in=keys).delete()
    ConfigEntry.objects.filter(key="content.badge_days").update(value=old_days)
    migration.forwards(apps, None)
    values = dict(ConfigEntry.objects.filter(key__in=keys).values_list("key", "value"))
    assert tuple(values[k] for k in keys) == expected


def test_caches_never_outlive_a_badge(api):
    """The signed-out billboard / New & Popular are cached; the cache ends when a badge does."""
    config.set("content.recently_added_hours", 1)
    config.set("content.public_cache_seconds", 60)
    now = timezone.now()
    for _ in range(3):
        TitleFactory(published_at=now - dt.timedelta(days=30))
    TitleFactory(published_at=now - dt.timedelta(hours=1) + dt.timedelta(seconds=20))
    left = badges.seconds_until_change()
    assert 1 <= left <= 21
    res = api.get("/api/v1/browse/new-and-popular?translation=translated")
    assert res.status_code == 200
    control = res["Cache-Control"]
    max_age = int(control.split("max-age=")[1].split(",")[0])
    swr = int(control.split("stale-while-revalidate=")[1].split(",")[0])
    assert max_age <= left and max_age + swr <= left + 1
    assert badges.cap(60) <= left and badges.cap(0) == 0


def test_no_badges_ahead_leaves_caches_alone():
    old = timezone.now() - dt.timedelta(days=200)
    TitleFactory(published_at=old)
    assert badges.seconds_until_change() is None
    assert badges.cap(60) == 60
