import pytest

from apps.engagement.models import ViewEvent, WatchProgress
from apps.engagement.tasks import flush_view_events
from apps.engagement.tracking import active_viewers
from apps.media import delivery
from apps.recommendations.cache import user_version
from tests.factories import EpisodeFactory, SeasonFactory, SeriesFactory, TitleFactory, VideoFactory

pytestmark = pytest.mark.django_db


def test_movie_playback_info_and_resume(auth_api):
    movie = TitleFactory()
    WatchProgress.objects.create(
        user=auth_api.user, title=movie, position_seconds=321, duration_seconds=600
    )
    info = auth_api.get(f"/api/v1/playback/{movie.slug}").json()
    assert info["start_at"] == 321
    assert info["master_url"].startswith(f"/api/v1/stream/{movie.video_id}/master.m3u8?t=")
    token = info["master_url"].split("t=")[1]
    assert delivery.check_token(token, str(movie.video_id)) == auth_api.user.pk
    assert [r["height"] for r in info["renditions"]] == [1080, 480]
    assert info["next"] is None and info["episode"] is None


def test_preview_is_capped_and_starts_mid_title(auth_api):
    movie = TitleFactory()
    info = auth_api.get(f"/api/v1/playback/{movie.slug}?preview=true").json()
    assert (
        info["is_preview"] and info["max_height"] == 720 and "max_height=720" in info["master_url"]
    )
    assert info["start_at"] == pytest.approx(90)  # 15% of 600 s


def test_series_without_trailer_advertises_its_episode_preview(auth_api):
    series = SeriesFactory(trailer=None)
    pending = SeriesFactory(trailer=None)
    EpisodeFactory(season=SeasonFactory(title=series, number=1), number=1)
    EpisodeFactory(
        season=SeasonFactory(title=pending, number=1), number=1, video=VideoFactory(status="queued")
    )
    detail = auth_api.get(f"/api/v1/titles/{series.slug}").json()["title"]
    assert detail["has_preview"] is True  # the card agrees with what playback will serve
    assert auth_api.get(f"/api/v1/playback/{series.slug}?preview=true").json()["is_preview"]
    assert auth_api.get(f"/api/v1/titles/{pending.slug}").json()["title"]["has_preview"] is False


def test_episode_playback_has_markers_and_next(auth_api):
    series = SeriesFactory()
    season = SeasonFactory(title=series, number=1)
    e1 = EpisodeFactory(season=season, number=1, intro_start=5, intro_end=40, credits_start=500)
    e2 = EpisodeFactory(season=season, number=2)
    info = auth_api.get(f"/api/v1/playback/{series.slug}?episode={e1.pk}").json()
    assert info["episode"]["intro_end"] == 40 and info["episode"]["credits_start"] == 500
    assert info["next"]["id"] == e2.pk and info["next"]["label"] == "S1:E2"
    # No episode given: the smart target (first episode for a new viewer).
    assert auth_api.get(f"/api/v1/playback/{series.slug}").json()["episode"]["id"] == e1.pk


def test_unavailable_title(auth_api):
    movie = TitleFactory(video=VideoFactory(status="transcoding"))
    assert auth_api.get(f"/api/v1/playback/{movie.slug}").status_code == 404


def test_playback_requires_login(api):
    assert api.get(f"/api/v1/playback/{TitleFactory().slug}").status_code in (401, 403)


def test_progress_upsert_and_completion_invalidates_recs(auth_api):
    movie = TitleFactory()
    before = user_version(auth_api.user.pk)
    body = {"updates": [{"title_id": movie.pk, "position": 120, "duration": 600, "watched": 10}]}
    assert auth_api.post("/api/v1/playback/progress", body, format="json").json() == {
        "saved": 1,
        "completed": [],
    }
    auth_api.post(
        "/api/v1/playback/progress",
        {"updates": [{"title_id": movie.pk, "position": 130, "duration": 600, "watched": 10}]},
        format="json",
    )
    p = WatchProgress.objects.get(user=auth_api.user, title=movie)
    assert p.position_seconds == 130 and p.watch_seconds == 20 and not p.completed
    assert user_version(auth_api.user.pk) == before  # plain progress doesn't bust the feed cache
    done = auth_api.post(
        "/api/v1/playback/progress",
        {"updates": [{"title_id": movie.pk, "position": 590, "duration": 600}]},
        format="json",
    ).json()
    assert done["completed"] == [movie.pk]
    p.refresh_from_db()
    assert p.completed and p.position_seconds == 0
    assert user_version(auth_api.user.pk) > before
    auth_api.post(
        "/api/v1/playback/progress",
        {"updates": [{"title_id": movie.pk, "position": 3, "duration": 600}]},
        format="json",
    )
    p.refresh_from_db()
    assert not p.completed  # rewatching from the start reopens it


def test_progress_rejects_foreign_episode(auth_api):
    a, b = SeriesFactory(), SeriesFactory()
    ep = EpisodeFactory(season=SeasonFactory(title=b))
    result = auth_api.post(
        "/api/v1/playback/progress",
        {"updates": [{"title_id": a.pk, "episode_id": ep.pk, "position": 1, "duration": 10}]},
        format="json",
    ).json()
    assert result["saved"] == 0


def test_events_are_buffered_then_flushed(auth_api):
    movie = TitleFactory()
    events = [
        {"session_id": "s1", "kind": "start", "title_id": movie.pk, "position": 0, "value": 850},
        {
            "session_id": "s1",
            "kind": "rebuffer",
            "title_id": movie.pk,
            "position": 30,
            "value": 1200,
        },
        {
            "session_id": "s1",
            "kind": "quality",
            "title_id": movie.pk,
            "position": 31,
            "value": 5000000,
            "data": {"height": 1080},
        },
    ]
    assert (
        auth_api.post("/api/v1/playback/events", {"events": events}, format="json").status_code
        == 202
    )
    assert ViewEvent.objects.count() == 0
    assert flush_view_events() == 3
    assert set(ViewEvent.objects.values_list("kind", flat=True)) == {"start", "rebuffer", "quality"}
    assert ViewEvent.objects.get(kind="quality").data == {"height": 1080}
    assert active_viewers() >= 1
