import datetime as dt

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.catalog.models import Billboard, HomeRow
from apps.catalog.services import link_related
from apps.core.config import config
from apps.engagement.models import Rating, WatchProgress
from apps.recommendations import engine, feed
from apps.recommendations.cache import catalog_version
from tests.factories import GenreFactory, TitleFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def catalog():
    drama = GenreFactory(name="Drama", slug="drama", show_on_home=True)
    action = GenreFactory(name="Action", slug="action", show_on_home=True)
    titles = []
    for i in range(14):
        t = TitleFactory(
            title=f"T{i:02d}", translation_status="translated", popularity=5.0, trending=float(i)
        )
        t.genres.add(drama if i % 2 else action)
        titles.append(t)
    return titles


def home(api, **params):
    q = "&".join(f"{k}={v}" for k, v in {"translation": "translated", **params}.items())
    rows, cursor = [], ""
    while True:
        body = api.get(f"/api/v1/browse/home?{q}{'&cursor=' + cursor if cursor else ''}").json()
        rows += body["rows"]
        if not body["next"]:
            return rows
        cursor = body["next"]


def row(rows, kind):
    return next(r for r in rows if r["kind"] == kind)


def test_cold_start_follows_popularity_not_noise(catalog):
    catalog[3].popularity = 50
    catalog[3].save()
    user = UserFactory()
    ranked, _ = engine.score(user.pk, "translated")
    assert ranked[0] == catalog[3].pk


def test_boost_raises_rank_in_cold_start_and_personalised(catalog):
    target = catalog[7]
    target.boost = 3
    target.save()
    newbie = UserFactory()
    assert engine.score(newbie.pk, "translated")[0][0] == target.pk
    fan = UserFactory()
    Rating.objects.create(user=fan, title=catalog[0], value=Rating.Value.LIKE)
    ranked, scores = engine.score(fan.pk, "translated")
    peer = catalog[9]  # same genre & popularity, unboosted
    assert scores[target.pk] > scores[peer.pk]


def test_negative_boost_demotes(catalog):
    target = catalog[5]
    target.popularity = 9
    target.save()
    user = UserFactory()
    assert engine.score(user.pk, "translated")[0][0] == target.pk
    target.boost = -2
    target.save()
    ranked, _ = engine.score(user.pk, "translated")
    assert ranked.index(target.pk) > len(ranked) // 2


def test_boost_pins_into_top_picks_for_new_and_existing_viewers(
    auth_api, staff_api, catalog, django_capture_on_commit_callbacks
):
    target = catalog[1]
    target.popularity = 0.1
    target.save()
    before = row(home(auth_api), "top_picks")["items"]
    assert before[0]["id"] != target.pk
    with django_capture_on_commit_callbacks(execute=True):
        response = staff_api.patch(f"/api/v1/admin/titles/{target.pk}", {"boost": 3}, format="json")
    assert response.status_code == 200 and response.json()["effective_boost"] == 3
    # Existing viewer with a warm cache sees it immediately (catalog version bumped on commit).
    assert row(home(auth_api), "top_picks")["items"][0]["id"] == target.pk
    newbie = UserFactory()
    from rest_framework.test import APIClient

    from apps.accounts.tokens import issue_access_token

    api2 = APIClient()
    api2.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_access_token(newbie)[0]}")
    assert row(home(api2), "top_picks")["items"][0]["id"] == target.pk
    billboard = auth_api.get("/api/v1/browse/billboard?translation=translated").json()
    assert billboard[0]["title"]["id"] == target.pk


def test_pinning_respects_dislikes_and_completion(catalog):
    a, b = catalog[2], catalog[4]
    a.boost, b.boost = 5, 4
    a.save()
    b.save()
    user = UserFactory()
    Rating.objects.create(user=user, title=a, value=Rating.Value.DISLIKE)
    signals = engine.load_signals(user.pk)
    pool = engine.candidates("translated")
    ranked, scores = engine.score(user.pk, "translated", signals, pool=pool)
    pinned = engine.pin_boosted(ranked, pool, scores, 10)
    assert pinned[0] == b.pk and a.pk not in pinned


def test_boost_window(catalog):
    target = catalog[6]
    now = timezone.now()
    target.boost = 4
    target.boost_starts_at = now - dt.timedelta(days=2)
    target.boost_ends_at = now - dt.timedelta(minutes=1)
    target.save()
    assert target.effective_boost() == 0
    assert engine.candidates("translated")[target.pk].boost == 0
    target.boost_ends_at = now + dt.timedelta(days=1)
    target.save()
    assert engine.candidates("translated")[target.pk].boost == 4
    target.boost_starts_at = now + dt.timedelta(hours=1)
    target.save()
    assert target.effective_boost() == 0


def test_top10_and_trending_ignore_boost(auth_api, catalog):
    HomeRow.objects.create(kind="top10", order=0)
    HomeRow.objects.create(kind="trending", order=1)
    before = [i["id"] for i in row(home(auth_api), "top10")["items"]]
    catalog[0].boost = 5  # lowest trending score
    catalog[0].save()
    rows = home(auth_api)
    assert [i["id"] for i in row(rows, "top10")["items"]] == before
    assert catalog[0].pk not in [i["id"] for i in row(rows, "top10")["items"]]
    assert [i["id"] for i in row(rows, "trending")["items"]][:5] == before[:5]


def test_disliked_titles_are_in_no_row_and_not_the_billboard(auth_api, catalog):
    hated = catalog[13]  # top trending
    Billboard.objects.create(title=hated, order=0)
    for order, kind in enumerate(
        ["top_picks", "trending", "top10", "new_releases", "collections", "home_genres", "my_list"]
    ):
        HomeRow.objects.create(kind=kind, order=order)
    from apps.catalog.models import Collection, CollectionItem

    col = Collection.objects.create(name="Picks", slug="picks")
    for i, t in enumerate(catalog[8:]):
        CollectionItem.objects.create(collection=col, title=t, order=i)
    assert hated.pk in {i["id"] for r in home(auth_api) for i in r["items"]}
    auth_api.put(f"/api/v1/ratings/{hated.pk}", {"value": -1}, format="json")
    rows = home(auth_api)
    for r in rows:
        assert hated.pk not in [i["id"] for i in r["items"]], r["title"]
    billboard = auth_api.get("/api/v1/browse/billboard?translation=translated").json()
    assert hated.pk not in [b["title"]["id"] for b in billboard]


def test_cross_row_dedupe(auth_api, catalog):
    genres = [catalog[0].genres.first(), catalog[1].genres.first()]
    for i in range(60):  # a catalog large enough that no row needs topping up
        TitleFactory(
            title=f"Extra {i}", translation_status="translated", popularity=1.0 + i % 7
        ).genres.add(genres[i % 2])
    config.set("recommendations.row_dedupe_window", 2)
    rows = home(auth_api)
    counts = {}
    for r in rows:
        if r["kind"] in ("continue_watching", "my_list", "top10"):
            continue
        for i in r["items"]:
            counts[i["id"]] = counts.get(i["id"], 0) + 1
    bad = {k for k, v in counts.items() if v > 2}
    assert max(counts.values()) <= 2, bad


def test_dedupe_never_empties_a_row():
    d = feed._Dedupe(window=1)
    assert d.apply("genre", [1, 2, 3, 4, 5]) == [1, 2, 3, 4, 5]
    assert d.apply("genre", [1, 2, 3, 4, 5, 6]) == [
        1,
        2,
        3,
        6,
    ]  # 1 new: topped up with least-shown to 4
    assert d.apply("top10", [1, 2]) == [1, 2]


def test_catalog_bump_invalidates_cached_rows(
    auth_api, staff_api, catalog, django_capture_on_commit_callbacks
):
    home(auth_api)
    v = catalog_version()
    with django_capture_on_commit_callbacks(execute=True):
        staff_api.post(f"/api/v1/admin/titles/{catalog[0].pk}/unpublish")
    assert catalog_version() > v
    ids = {i["id"] for r in home(auth_api) for i in r["items"]}
    assert catalog[0].pk not in ids


def test_boost_changes_are_audited(staff_api, catalog):
    from apps.core.models import AuditLog

    staff_api.patch(f"/api/v1/admin/titles/{catalog[0].pk}", {"boost": 2}, format="json")
    log = AuditLog.objects.get(action="title.boost")
    assert log.changes["boost"] == {"old": "0", "new": "2"}
    bulk = staff_api.post(
        "/api/v1/admin/titles/bulk",
        {"ids": [catalog[1].pk, catalog[2].pk], "action": "set_priority", "boost": -1},
        format="json",
    )
    assert bulk.status_code == 200, bulk.json()
    catalog[1].refresh_from_db()
    assert catalog[1].boost == -1
    assert staff_api.get("/api/v1/admin/titles?priority=demoted").json()["count"] == 2
    ordered = staff_api.get("/api/v1/admin/titles?ordering=-boost").json()["results"]
    assert ordered[0]["boost"] == 2


def test_because_you_liked_query_count_is_constant(catalog):
    def seeded_user(n):
        user = UserFactory()
        for t in catalog[:n]:
            Rating.objects.create(user=user, title=t, value=Rating.Value.LIKE)
            link_related(t, catalog[-1], 3)
        return user

    def queries(user):
        signals = engine.load_signals(user.pk)
        pool = engine.candidates("translated")
        with CaptureQueriesContext(connection) as ctx:
            engine.because_you_liked(user.pk, "translated", signals, 20, pool)
        return len(ctx.captured_queries)

    config.set("recommendations.because_you_liked_rows", 4)
    assert queries(seeded_user(1)) == queries(seeded_user(6)) <= 3


def test_meaningful_tail_rows(catalog):
    user = UserFactory()
    for i, t in enumerate(catalog):
        t.popularity = 0.5 if i < 4 else 10 + i
        t.save()
    for _ in range(3):
        Rating.objects.create(user=UserFactory(), title=catalog[0], value=Rating.Value.LOVE)
    pool = engine.candidates("translated")
    gems = engine.hidden_gems(pool, set(), 10, user.pk)
    assert gems[0] == catalog[0].pk  # loved, unpopular
    assert len(gems) == 5 and catalog[13].pk not in gems  # bottom 40 % by popularity only
    old = catalog[10]
    old.published_at = timezone.now() - dt.timedelta(days=400)
    old.save()
    assert engine.might_have_missed(engine.candidates("translated"), set(), 5) == [old.pk]
    WatchProgress.objects.create(
        user=user, title=catalog[1], position_seconds=300, duration_seconds=600
    )  # drama
    drama = catalog[1].genres.first().pk
    different = engine.something_different(pool, engine.load_signals(user.pk), set(), 10)
    assert (
        different
        and all(drama not in pool[d].genres for d in different)
        and catalog[1].pk not in different
    )
