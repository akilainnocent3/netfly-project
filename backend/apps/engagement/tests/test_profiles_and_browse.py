"""Phase 4: profiles (scoping, kids, limits), badges, Continue Watching hide,
Coming Soon + reminders, notifications, New & Popular."""

import datetime as dt

import pytest
from django.utils import timezone

from apps.accounts.models import ViewerProfile
from apps.catalog.models import Title
from apps.core.config import config
from apps.engagement.models import MyListItem, Rating, Reminder, WatchProgress
from tests.factories import EpisodeFactory, SeasonFactory, SeriesFactory, TitleFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def profiles_on():
    config.set("features.profiles_enabled", True)


def _profile(auth_api, name, **extra):
    r = auth_api.post("/api/v1/profiles", {"name": name, **extra}, format="json")
    assert r.status_code == 201, r.content
    return r.json()


def _as(auth_api, profile_id):
    auth_api.credentials(
        HTTP_AUTHORIZATION=auth_api._credentials["HTTP_AUTHORIZATION"],
        HTTP_X_PROFILE=str(profile_id),
    )
    return auth_api


# -- profiles -------------------------------------------------------------------------------


def test_profiles_disabled_by_default(auth_api):
    body = auth_api.get("/api/v1/profiles").json()
    assert body["enabled"] is False and body["results"] == []
    assert auth_api.post("/api/v1/profiles", {"name": "Kid"}, format="json").status_code == 404


def test_profile_limit_and_unique_names(auth_api, profiles_on):
    config.set("features.max_profiles", 2)
    _profile(auth_api, "Ana")
    dup = auth_api.post("/api/v1/profiles", {"name": "ana"}, format="json")
    assert dup.status_code == 400
    _profile(auth_api, "Ben")
    over = auth_api.post("/api/v1/profiles", {"name": "Cy"}, format="json")
    assert over.status_code == 400 and over.json()["code"] == "profile_limit"


def test_profiles_are_scoped_to_the_account(auth_api, profiles_on, staff):
    other = ViewerProfile.objects.create(user=staff, name="Not yours")
    assert (
        auth_api.patch(f"/api/v1/profiles/{other.pk}", {"name": "x"}, format="json").status_code
        == 404
    )
    assert auth_api.delete(f"/api/v1/profiles/{other.pk}").status_code == 404
    # A foreign X-Profile header is ignored (falls back to the account scope).
    title = TitleFactory()
    _as(auth_api, other.pk).put(f"/api/v1/my-list/{title.pk}")
    assert MyListItem.objects.get(title=title).profile_id is None


def test_last_profile_cannot_be_deleted(auth_api, profiles_on):
    p = _profile(auth_api, "Solo")
    assert auth_api.delete(f"/api/v1/profiles/{p['id']}").status_code == 400


def test_first_profile_adopts_account_history(auth_api, profiles_on):
    title = TitleFactory()
    MyListItem.objects.create(user=auth_api.user, title=title)
    Rating.objects.create(user=auth_api.user, title=title, value=2)
    p = _profile(auth_api, "Owner")
    assert MyListItem.objects.get(title=title).profile_id == p["id"]
    assert Rating.objects.get(title=title).profile_id == p["id"]


def test_engagement_is_per_profile(auth_api, profiles_on):
    a = _profile(auth_api, "Ana")
    b = _profile(auth_api, "Ben")
    title = TitleFactory()
    _as(auth_api, a["id"]).put(f"/api/v1/my-list/{title.pk}")
    _as(auth_api, a["id"]).put(f"/api/v1/ratings/{title.pk}", {"value": -1}, format="json")
    assert [t["id"] for t in _as(auth_api, a["id"]).get("/api/v1/my-list").json()] == [title.pk]
    assert _as(auth_api, b["id"]).get("/api/v1/my-list").json() == []
    detail = _as(auth_api, b["id"]).get(f"/api/v1/titles/{title.slug}").json()
    assert detail["viewer"]["rating"] is None and detail["viewer"]["in_my_list"] is False


def test_kids_profile_sees_only_kids_ratings(auth_api, profiles_on):
    kid = _profile(auth_api, "Kid", is_kids=True)
    family = TitleFactory(title="Family Fun", maturity_rating="PG")
    grown = TitleFactory(title="Grown Up", maturity_rating="TV-MA")
    api = _as(auth_api, kid["id"])
    home = {i["id"] for r in api.get("/api/v1/browse/home").json()["rows"] for i in r["items"]}
    assert family.pk in home and grown.pk not in home
    assert api.get(f"/api/v1/titles/{grown.slug}").status_code == 404
    assert [t["id"] for t in api.get("/api/v1/search?q=Grown").json()] == []
    assert api.get(f"/api/v1/playback/{grown.slug}").status_code == 404


def test_recommendation_cache_is_per_profile(auth_api, profiles_on):
    from apps.recommendations import cache as recs_cache

    a = _profile(auth_api, "Ana")
    title = TitleFactory()
    before = recs_cache.key(f"{auth_api.user.pk}.{a['id']}", "rows")
    _as(auth_api, a["id"]).put(f"/api/v1/my-list/{title.pk}")
    assert recs_cache.key(f"{auth_api.user.pk}.{a['id']}", "rows") != before


# -- badges ---------------------------------------------------------------------------------


def test_card_badges(auth_api):
    now = timezone.now()
    old = now - dt.timedelta(days=60)
    leaving = TitleFactory(published_at=old, license_end=now + dt.timedelta(days=3))
    fresh = TitleFactory(published_at=now - dt.timedelta(days=2))
    series = SeriesFactory(published_at=old)
    EpisodeFactory(season=SeasonFactory(title=series, number=1), number=1)
    plain = TitleFactory(published_at=old)
    from apps.catalog.queries import badge_context, cards_by_ids
    from apps.catalog.serializers import TitleCardSerializer

    cards = TitleCardSerializer(
        cards_by_ids([leaving.pk, fresh.pk, series.pk, plain.pk]),
        many=True,
        context={"badges": {"top10": {}}},
    ).data
    assert [c["badge"] for c in cards] == ["leaving_soon", "recently_added", "new_episodes", None]
    ranks = badge_context("translated")["top10"]
    # Top 10 needs at least five titles to mean anything; we have four.
    assert ranks == {}
    from django.core.cache import cache

    top = TitleFactory(trending=99)
    cache.clear()
    ranks = badge_context("translated")["top10"]
    assert ranks[top.pk] == 1 and len(ranks) == 5
    card = TitleCardSerializer(cards_by_ids([top.pk])[0], context={"badges": {"top10": ranks}}).data
    assert card["badge"] == "top10" and card["top10_rank"] == 1
    rows = auth_api.get("/api/v1/browse/home").json()["rows"]
    assert all("badge" in i and "moods" in i for r in rows for i in r["items"])


def test_moods_fall_back_to_genres():
    from apps.catalog.queries import cards_by_ids
    from apps.catalog.serializers import TitleCardSerializer
    from tests.factories import GenreFactory

    t = TitleFactory()
    t.genres.add(GenreFactory(name="Thriller", slug="thriller"))
    assert TitleCardSerializer(cards_by_ids([t.pk])[0]).data["moods"] == ["Suspenseful"]
    t.moods = ["Witty", "Heartfelt"]
    t.save()
    assert TitleCardSerializer(cards_by_ids([t.pk])[0]).data["moods"] == ["Witty", "Heartfelt"]


# -- Continue Watching hide -----------------------------------------------------------------


def test_remove_from_continue_watching_until_played_again(auth_api):
    title = TitleFactory()
    WatchProgress.objects.create(
        user=auth_api.user, title=title, position_seconds=300, duration_seconds=3000
    )

    def in_row():
        rows = auth_api.get("/api/v1/browse/home").json()["rows"]
        cw = [r for r in rows if r["kind"] == "continue_watching"]
        return bool(cw) and title.pk in [i["id"] for i in cw[0]["items"]]

    assert in_row()
    assert auth_api.delete(f"/api/v1/continue-watching/{title.pk}").status_code == 204
    assert not in_row()
    auth_api.post(
        "/api/v1/playback/progress",
        {"updates": [{"title_id": title.pk, "position": 400, "duration": 3000, "watched": 10}]},
        format="json",
    )
    assert in_row()


# -- Coming soon, reminders, notifications --------------------------------------------------


@pytest.fixture
def upcoming():
    return TitleFactory(
        title="Soon",
        status=Title.Status.DRAFT,
        published_at=None,
        publish_at=timezone.now() + dt.timedelta(days=5),
    )


def test_upcoming_is_public_and_only_scheduled(api, upcoming):
    TitleFactory(title="Unscheduled draft", status=Title.Status.DRAFT, published_at=None)
    body = api.get("/api/v1/browse/upcoming").json()
    assert [t["id"] for t in body] == [upcoming.pk]
    assert body[0]["reminded"] is None and body[0]["publish_at"]


def test_remind_me_round_trip(auth_api, upcoming):
    published = TitleFactory()
    assert auth_api.put(f"/api/v1/reminders/{published.pk}").status_code == 404
    assert auth_api.put(f"/api/v1/reminders/{upcoming.pk}").status_code == 204
    assert auth_api.put(f"/api/v1/reminders/{upcoming.pk}").status_code == 204  # idempotent
    assert Reminder.objects.filter(user=auth_api.user).count() == 1
    assert auth_api.get("/api/v1/browse/upcoming").json()[0]["reminded"] is True
    tabs = auth_api.get("/api/v1/browse/new-and-popular").json()
    assert tabs["coming_soon"][0]["reminded"] is True
    assert auth_api.delete(f"/api/v1/reminders/{upcoming.pk}").status_code == 204
    assert auth_api.get("/api/v1/browse/upcoming").json()[0]["reminded"] is False


def test_reminder_becomes_a_notification_on_release(auth_api, upcoming):
    auth_api.put(f"/api/v1/reminders/{upcoming.pk}")
    upcoming.status = Title.Status.PUBLISHED
    upcoming.published_at = timezone.now()
    upcoming.save()
    body = auth_api.get("/api/v1/notifications").json()
    first = body["results"][0]
    assert first["kind"] == "reminder" and first["title"]["id"] == upcoming.pk
    assert body["unread"] >= 1
    assert auth_api.post("/api/v1/notifications/seen").status_code == 204
    assert auth_api.get("/api/v1/notifications").json()["unread"] == 0


def test_new_and_popular_tabs(auth_api):
    films = [TitleFactory(trending=i) for i in range(12)]
    series = [SeriesFactory(trending=i) for i in range(3)]
    for s in series:
        EpisodeFactory(season=SeasonFactory(title=s, number=1), number=1)
    body = auth_api.get("/api/v1/browse/new-and-popular").json()
    assert [t["id"] for t in body["top10_films"]] == [t.pk for t in films[::-1][:10]]
    assert [t["context"]["rank"] for t in body["top10_films"]] == list(range(1, 11))
    assert {t["id"] for t in body["top10_series"]} == {s.pk for s in series}
    assert len(body["everyone_watching"]) == 15


def test_new_endpoints_require_auth(api, upcoming):
    # New & Popular is browsable signed out (see catalog/tests/test_anonymous.py); actions are not.
    for method, url in [
        ("get", "/api/v1/notifications"),
        ("put", f"/api/v1/reminders/{upcoming.pk}"),
        ("delete", "/api/v1/continue-watching/1"),
        ("get", "/api/v1/profiles"),
    ]:
        assert getattr(api, method)(url).status_code == 401, url


def test_engagement_rate_limited(auth_api, upcoming):
    config.set("security.rate_engagement", "3/min")
    codes = [auth_api.put(f"/api/v1/reminders/{upcoming.pk}").status_code for _ in range(5)]
    assert codes[:3] == [204, 204, 204] and codes[-1] == 429


def test_billboard_type_filter(api):
    film = TitleFactory()
    show = SeriesFactory()
    EpisodeFactory(season=SeasonFactory(title=show, number=1), number=1)
    series_ids = [i["title"]["id"] for i in api.get("/api/v1/browse/billboard?type=series").json()]
    film_ids = [i["title"]["id"] for i in api.get("/api/v1/browse/billboard?type=movie").json()]
    assert show.pk in series_ids and film.pk not in series_ids
    assert film.pk in film_ids and show.pk not in film_ids


def test_title_quality_label(api):
    t = TitleFactory()
    t.video.renditions = [{"height": 720}, {"height": 2160}]
    t.video.save()
    assert api.get(f"/api/v1/titles/{t.slug}").json()["title"]["quality"] == "4K"
    t.video.renditions = [{"height": 480}, {"height": 1080}]
    t.video.save()
    assert api.get(f"/api/v1/titles/{t.slug}").json()["title"]["quality"] == "HD"


@pytest.mark.parametrize(
    "method,url",
    [
        ("put", "/api/v1/my-list/{pk}"),
        ("put", "/api/v1/ratings/{pk}"),
        ("get", "/api/v1/notifications"),
    ],
)
def test_engagement_endpoints_are_rate_limited(auth_api, method, url):
    config.set("security.rate_engagement", "2/min")
    title = TitleFactory()
    body = {"value": 1} if "ratings" in url else None
    codes = [
        getattr(auth_api, method)(url.format(pk=title.pk), body, format="json").status_code
        for _ in range(3)
    ]
    assert 429 not in codes[:2] and codes[2] == 429
