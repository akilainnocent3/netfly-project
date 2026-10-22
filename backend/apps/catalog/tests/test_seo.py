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


def test_catalog_lists_published_titles_a_to_z_with_letter_index(api, catalog):
    TitleFactory(title="the Rain")
    TitleFactory(title="24 Frames")
    body = api.get("/api/v1/public/catalog").json()
    assert [t["title"] for t in body["results"]] == ["24 Frames", "Hot", "the Rain", "Warm"]
    assert body["count"] == 4 and body["page"] == 1 and body["pages"] == 1
    assert body["letters"] == [
        {"letter": "#", "page": 1},
        {"letter": "H", "page": 1},
        {"letter": "T", "page": 1},
        {"letter": "W", "page": 1},
    ]
    assert api.get("/api/v1/public/catalog?page=2").status_code == 404


def test_catalog_paginates(api, catalog, monkeypatch):
    from apps.catalog import seo

    monkeypatch.setattr(seo, "CATALOG_PAGE_SIZE", 1)
    body = api.get("/api/v1/public/catalog?page=2").json()
    assert body["pages"] == 2 and [t["title"] for t in body["results"]] == ["Warm"]
    assert body["letters"] == [{"letter": "H", "page": 1}, {"letter": "W", "page": 2}]


def test_indexnow_key_file_only_for_the_configured_key(api):
    assert api.get("/api/v1/public/indexnow/abcdefgh1234").status_code == 404
    config.set("seo.indexnow_key", "abcdefgh1234")
    res = api.get("/api/v1/public/indexnow/abcdefgh1234")
    assert res.status_code == 200 and res.content == b"abcdefgh1234"
    assert res["Content-Type"].startswith("text/plain")
    assert api.get("/api/v1/public/indexnow/zzzzzzzz9999").status_code == 404


def test_publish_and_unpublish_notify_indexnow_in_one_audited_batch(
    content_manager_api, catalog, django_capture_on_commit_callbacks, monkeypatch
):
    from django.core.cache import cache

    from apps.catalog import indexnow
    from apps.core.models import AuditLog

    cache.delete_many([indexnow.PENDING, indexnow.SCHEDULED])
    config.set("seo.indexnow_key", "abcdefgh1234")
    config.set("seo.site_url", "https://watch.example.com")
    sent = []

    class Ok:
        status_code = 200

    monkeypatch.setattr(
        indexnow.requests, "post", lambda url, json, timeout: sent.append(json) or Ok()
    )
    # Hold the (eager) task until both changes are queued, like the 60 s countdown does.
    monkeypatch.setattr("apps.catalog.tasks.send_indexnow.apply_async", lambda **kw: None)
    with django_capture_on_commit_callbacks(execute=True):
        content_manager_api.post(f"/api/v1/admin/titles/{catalog['draft'].pk}/publish")
        content_manager_api.post(f"/api/v1/admin/titles/{catalog['hot'].pk}/unpublish")
    assert indexnow.send() == {"status": 200, "urls": 3}
    assert sent == [
        {
            "host": "watch.example.com",
            "key": "abcdefgh1234",
            "keyLocation": "https://watch.example.com/abcdefgh1234.txt",
            "urlList": [
                f"https://watch.example.com/title/{catalog['draft'].slug}",
                f"https://watch.example.com/title/{catalog['hot'].slug}",
                "https://watch.example.com/titles",
            ],
        }
    ]
    assert AuditLog.objects.filter(action="seo.indexnow").count() == 1
    assert indexnow.send() is None  # nothing left to send


def test_indexnow_is_off_without_a_key(catalog, monkeypatch):
    from apps.catalog import indexnow

    monkeypatch.setattr(indexnow.requests, "post", lambda *a, **k: pytest.fail("sent"))
    config.set("seo.site_url", "https://watch.example.com")
    indexnow.queue("anything")
    assert indexnow.send() is None


def test_seed_demo_adds_missing_demo_titles_to_an_existing_catalog():
    from django.core.management import call_command

    TitleFactory(title="Neon Tide", slug="neon-tide")
    call_command("seed_demo", "--no-media")
    rain = Title.objects.get(slug="the-rain")
    assert rain.status == Title.Status.PUBLISHED and rain.type == "series"
    assert rain.cast == ["Mira Solberg", "Jonas Ekdahl", "Ama Mensah"]
    assert rain.seasons.count() == 2
    call_command("seed_demo", "--no-media")  # idempotent
    assert Title.objects.filter(slug="the-rain").count() == 1
