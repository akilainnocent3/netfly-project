"""Signed-out visitors browse the real app: a shared, non-personalised feed."""

import pytest

from apps.engagement.models import MyListItem, Rating, WatchProgress
from apps.recommendations.cache import bump_catalog
from tests.factories import GenreFactory, TitleFactory

pytestmark = pytest.mark.django_db

PERSONAL_KINDS = {"continue_watching", "my_list", "because_you_liked"}


@pytest.fixture
def catalog():
    drama = GenreFactory(name="Drama", slug="drama", show_on_home=True)
    titles = [
        TitleFactory(title=f"Story {i}", translation_status="translated", popularity=100 - i)
        for i in range(12)
    ]
    for t in titles:
        t.genres.add(drama)
    return titles


def test_anonymous_home_is_public_and_not_personal(api, catalog, user):
    # Someone else's activity must never leak into the shared feed.
    WatchProgress.objects.create(
        user=user, title=catalog[0], position_seconds=60, duration_seconds=600
    )
    MyListItem.objects.create(user=user, title=catalog[1])
    res = api.get("/api/v1/browse/home?translation=translated")
    assert res.status_code == 200
    body = res.json()
    kinds = {row["kind"] for row in body["rows"]}
    assert kinds and not kinds & PERSONAL_KINDS
    assert any(row["title"].startswith("Popular on") for row in body["rows"])
    for row in body["rows"]:
        for item in row["items"]:
            assert item.get("match") is None
            assert not (item.get("viewer") or {}).get("in_my_list")
    assert res["Cache-Control"].startswith("public")
    assert "Authorization" in res["Vary"]


def test_anonymous_home_is_shared_and_follows_the_catalog_version(api, catalog):
    first = api.get("/api/v1/browse/home?translation=translated").json()
    again = api.get("/api/v1/browse/home?translation=translated").json()
    assert first == again
    newcomer = TitleFactory(title="Brand New", translation_status="translated", popularity=999)
    newcomer.genres.add(catalog[0].genres.first())
    bump_catalog()
    ids = {
        i["id"]
        for row in api.get("/api/v1/browse/home?translation=translated").json()["rows"]
        for i in row["items"]
    }
    assert newcomer.pk in ids


def test_signed_in_home_stays_private(auth_api, catalog):
    res = auth_api.get("/api/v1/browse/home?translation=translated")
    assert res["Cache-Control"] == "private, no-store"
    assert any(row["title"] == "Top picks for you" for row in res.json()["rows"])


def test_anonymous_new_and_popular_and_title_page(api, catalog, user):
    Rating.objects.create(user=user, title=catalog[0], value=1)
    res = api.get("/api/v1/browse/new-and-popular?translation=translated")
    assert res.status_code == 200
    body = res.json()
    assert len(body["everyone_watching"]) == 12
    assert all(not (t.get("viewer") or {}).get("rating") for t in body["everyone_watching"])
    assert res["Cache-Control"].startswith("public")
    page = api.get(f"/api/v1/titles/{catalog[0].slug}")
    assert page.status_code == 200
    viewer = page.json()["viewer"]
    assert viewer["in_my_list"] is False and viewer["rating"] is None
    assert viewer["last_season"] is None
    assert "Authorization" in page["Vary"]


def test_anonymous_search_and_actions(api, catalog):
    assert api.get("/api/v1/search?q=Story&translation=translated").status_code == 200
    # Browsing is open; anything that needs an account is not.
    assert api.put(f"/api/v1/my-list/{catalog[0].pk}").status_code == 401
    assert api.get(f"/api/v1/playback/{catalog[0].slug}").status_code == 401
