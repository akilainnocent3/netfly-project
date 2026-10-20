import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.catalog.models import Billboard
from apps.core.config import config
from apps.engagement.models import MyListItem, WatchProgress
from tests.factories import EpisodeFactory, GenreFactory, SeasonFactory, SeriesFactory, TitleFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def catalog():
    drama = GenreFactory(name="Drama", slug="drama", show_on_home=True)
    translated = [TitleFactory(title=f"Tr {i}", translation_status="translated") for i in range(4)]
    original = [
        TitleFactory(title=f"Og {i}", translation_status="not_translated") for i in range(3)
    ]
    for t in translated + original:
        t.genres.add(drama)
    return {"translated": translated, "original": original, "genre": drama}


def ids_in_home(api, mode):
    body = api.get(f"/api/v1/browse/home?translation={mode}").json()
    return {item["id"] for row in body["rows"] for item in row["items"]}


ENDPOINTS = [
    "/api/v1/browse/home?translation={m}",
    "/api/v1/browse/billboard?translation={m}",
    "/api/v1/genres/drama/titles?translation={m}",
    "/api/v1/search?q=Tr&translation={m}",
    "/api/v1/search?q=Og&translation={m}",
    "/api/v1/my-list?translation={m}",
]


def _titles(body):
    if isinstance(body, dict) and "rows" in body:
        return [i for r in body["rows"] for i in r["items"]]
    if isinstance(body, list):
        return [b["title"] if "title" in b and isinstance(b["title"], dict) else b for b in body]
    return []


@pytest.mark.parametrize(
    "mode,other", [("translated", "not_translated"), ("not_translated", "translated")]
)
def test_translation_filter_enforced_everywhere(auth_api, catalog, mode, other):
    for t in catalog["translated"] + catalog["original"]:
        MyListItem.objects.create(user=auth_api.user, title=t)
        Billboard.objects.create(title=t)
    for url in ENDPOINTS:
        items = _titles(auth_api.get(url.format(m=mode)).json())
        assert all(i["translation_status"] == mode for i in items), url
    genres = auth_api.get(f"/api/v1/genres?translation={mode}").json()
    expected = len(catalog["translated"] if mode == "translated" else catalog["original"])
    assert genres[0]["title_count"] == expected


def test_all_mode_only_when_flag_enabled(auth_api, catalog):
    auth_api.user.translation_mode = ""
    auth_api.user.save()
    assert ids_in_home(auth_api, "all") <= {
        t.id for t in catalog["translated"]
    }  # falls back to default
    config.set("features.translation_filter_allow_all", True)
    assert ids_in_home(auth_api, "all") == {
        t.id for t in catalog["translated"] + catalog["original"]
    }


def test_drafts_and_expired_never_visible(auth_api, catalog):
    import datetime as dt

    from django.utils import timezone

    draft = TitleFactory(title="Secret draft", status="draft", translation_status="translated")
    expired = TitleFactory(
        title="Expired",
        translation_status="translated",
        license_end=timezone.now() - dt.timedelta(days=1),
    )
    seen = ids_in_home(auth_api, "translated")
    assert draft.id not in seen and expired.id not in seen
    assert auth_api.get(f"/api/v1/titles/{draft.slug}").status_code == 404


def test_home_query_count_is_constant(auth_api, catalog, django_assert_max_num_queries):
    auth_api.get("/api/v1/browse/home?translation=translated")  # warm the row cache
    for _ in range(25):
        t = TitleFactory(translation_status="translated")
        t.genres.add(catalog["genre"])
    from apps.recommendations.cache import invalidate_user

    invalidate_user(auth_api.user.pk)
    auth_api.get("/api/v1/browse/home?translation=translated")
    with CaptureQueriesContext(connection) as ctx:
        response = auth_api.get("/api/v1/browse/home?translation=translated")
    assert response.status_code == 200
    # Cached rows + live Continue Watching/My List + one card query (+ prefetches) + viewer state.
    assert len(ctx.captured_queries) <= 14, [q["sql"][:120] for q in ctx.captured_queries]


def test_smart_play_button_for_series(auth_api):
    series = SeriesFactory(translation_status="translated")
    s1 = SeasonFactory(title=series, number=1)
    s2 = SeasonFactory(title=series, number=2)
    e11, e12 = EpisodeFactory(season=s1, number=1), EpisodeFactory(season=s1, number=2)
    e21 = EpisodeFactory(season=s2, number=1)
    play = lambda: auth_api.get(f"/api/v1/titles/{series.slug}").json()["viewer"][
        "play"
    ]  # noqa: E731
    assert play()["label"] == "Play S1:E1"
    WatchProgress.objects.create(
        user=auth_api.user, title=series, episode=e12, position_seconds=300, duration_seconds=600
    )
    assert play() | {} == play() and play()["label"] == "Resume S1:E2" and play()["position"] == 300
    WatchProgress.objects.filter(episode=e12).update(completed=True, position_seconds=0)
    assert play()["label"] == "Play S2:E1" and play()["episode_id"] == e21.id
    assert e11  # first episode exists


def test_continue_watching_row_and_next_episode(auth_api):
    movie = TitleFactory(translation_status="translated")
    WatchProgress.objects.create(
        user=auth_api.user, title=movie, position_seconds=200, duration_seconds=600
    )
    series = SeriesFactory(translation_status="translated")
    season = SeasonFactory(title=series, number=1)
    e1, e2 = EpisodeFactory(season=season, number=1), EpisodeFactory(season=season, number=2)
    WatchProgress.objects.create(
        user=auth_api.user, title=series, episode=e1, completed=True, duration_seconds=600
    )
    rows = auth_api.get("/api/v1/browse/home?translation=translated").json()["rows"]
    cw = next(r for r in rows if r["kind"] == "continue_watching")
    by_id = {i["id"]: i for i in cw["items"]}
    assert by_id[movie.id]["context"]["progress"] == pytest.approx(0.333, abs=0.01)
    assert (
        by_id[series.id]["context"]["label"] == "S1:E2"
        and by_id[series.id]["context"]["episode_id"] == e2.id
    )


def test_continue_watching_other_mode_badge(auth_api):
    other = TitleFactory(translation_status="not_translated")
    WatchProgress.objects.create(
        user=auth_api.user, title=other, position_seconds=100, duration_seconds=600
    )
    rows = auth_api.get("/api/v1/browse/home?translation=translated").json()["rows"]
    assert not any(r["kind"] == "continue_watching" for r in rows)
    config.set("features.continue_watching_ignores_filter", True)
    rows = auth_api.get("/api/v1/browse/home?translation=translated").json()["rows"]
    cw = next(r for r in rows if r["kind"] == "continue_watching")
    assert cw["items"][0]["context"]["other_mode"] is True


def test_search_is_typo_tolerant_and_logged(auth_api):
    TitleFactory(title="Kingdom of Ash", translation_status="translated")
    results = auth_api.get("/api/v1/search?q=kingdm&translation=translated").json()
    assert [r["title"] for r in results] == ["Kingdom of Ash"]
    auth_api.get("/api/v1/search?q=kingdom&translation=translated")
    from apps.engagement.models import SearchLog

    assert SearchLog.objects.filter(user=auth_api.user).count() == 1  # prefixes collapsed
    suggestions = auth_api.get("/api/v1/search/suggestions").json()
    assert suggestions["recent"] == ["kingdom"]


def test_infinite_feed_paginates(auth_api, catalog):
    config.set("content.home_rows_per_page", 2)
    first = auth_api.get("/api/v1/browse/home?translation=translated").json()
    assert len(first["rows"]) <= 2 and first["next"]
    second = auth_api.get(
        f"/api/v1/browse/home?translation=translated&cursor={first['next']}"
    ).json()
    assert {r["key"] for r in second["rows"]}.isdisjoint({r["key"] for r in first["rows"]})
