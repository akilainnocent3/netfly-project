import pytest

from apps.catalog.models import Title
from apps.core.config import config
from tests.factories import GenreFactory, TitleFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def catalog():
    drama = GenreFactory(name="Drama", slug="drama")
    GenreFactory(name="Empty", slug="empty")
    hot = TitleFactory(title="Hot", trending=50, popularity=10)
    warm = TitleFactory(title="Warm", trending=10, popularity=10)
    draft = TitleFactory(title="Draft", status=Title.Status.DRAFT, trending=99)
    for t in (hot, warm, draft):
        t.genres.add(drama)
    return {"hot": hot, "warm": warm, "draft": draft}


def test_landing_is_public_ranked_and_cacheable(api, catalog):
    res = api.get("/api/v1/public/landing")
    assert res.status_code == 200
    body = res.json()
    assert [t["title"] for t in body["trending"]] == ["Hot", "Warm"]
    assert [t["context"]["rank"] for t in body["trending"]] == [1, 2]
    # Only genres with published titles are crawl paths.
    assert body["genres"] == [{"name": "Drama", "slug": "drama"}]
    assert res["Cache-Control"].startswith("public")


def test_sitemap_lists_only_published_titles(api, catalog):
    body = api.get("/api/v1/public/sitemap").json()
    slugs = {t["slug"] for t in body["titles"]}
    assert slugs == {catalog["hot"].slug, catalog["warm"].slug}
    assert all(t["updated_at"] and t["type"] == "movie" for t in body["titles"])
    assert [g["slug"] for g in body["genres"]] == ["drama"]
    assert body["genres"][0]["updated_at"]


def test_sitemap_follows_admin_publish_without_waiting(
    api, content_manager_api, catalog, django_capture_on_commit_callbacks
):
    api.get("/api/v1/public/sitemap")  # warm the cache
    draft = catalog["draft"]
    with django_capture_on_commit_callbacks(execute=True):
        res = content_manager_api.post(f"/api/v1/admin/titles/{draft.pk}/publish")
    assert res.json()["status"] == "published", res.content
    slugs = {t["slug"] for t in api.get("/api/v1/public/sitemap").json()["titles"]}
    assert draft.slug in slugs


def test_public_endpoints_are_rate_limited(api, catalog):
    config.set("security.rate_public", "2/min")
    codes = [api.get("/api/v1/public/landing").status_code for _ in range(3)]
    assert codes == [200, 200, 429]
