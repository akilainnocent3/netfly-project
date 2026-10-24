"""Category artwork: what viewers see in every render state, and how fast changes show up."""

import pytest

from apps.media.models import ImageAsset
from apps.recommendations.cache import catalog_version
from tests.factories import GenreFactory, ImageFactory, TitleFactory

pytestmark = pytest.mark.django_db
S = ImageAsset.Status


@pytest.fixture
def comedy():
    genre = GenreFactory(name="Comedy", slug="comedy")
    title = TitleFactory(popularity=10)
    title.genres.add(genre)
    return genre, title


def tiles(api, **headers):
    res = api.get("/api/v1/genres?translation=all", **headers)
    assert res.status_code == 200
    return res, {g["slug"]: g for g in res.json()}


@pytest.mark.parametrize("state", ["ready", "processing", "failed", "none"])
def test_every_artwork_state_has_an_image(api, comedy, state):
    genre, title = comedy
    if state != "none":
        genre.artwork = ImageFactory(kind="artwork", status=state, width=1280, height=720)
        genre.save()
    _, by_slug = tiles(api)
    tile = by_slug["comedy"]
    if state == "ready":
        assert tile["artwork"]["key"] == genre.artwork.key
        assert tile["sample"] is None
    else:
        # Missing, still rendering or failed: never an empty tile.
        assert tile["artwork"] is None
        assert tile["sample"]["key"] == title.backdrop.key


def test_changing_artwork_bumps_the_catalog_version(
    api, comedy, content_manager_api, django_capture_on_commit_callbacks
):
    genre, _ = comedy
    before = catalog_version()
    _, by_slug = tiles(api)
    assert by_slug["comedy"]["artwork"] is None
    art = ImageFactory(kind="artwork", width=1280, height=720)
    with django_capture_on_commit_callbacks(execute=True):
        res = content_manager_api.patch(
            f"/api/v1/admin/genres/{genre.pk}", {"artwork_id": str(art.pk)}, format="json"
        )
    assert res.status_code == 200
    assert catalog_version() > before
    _, by_slug = tiles(api)
    assert by_slug["comedy"]["artwork"]["key"] == art.key


def test_finishing_a_render_refreshes_the_cached_tiles(api, comedy, monkeypatch):
    """The tiles were cached while the artwork rendered; the render's end must replace them."""
    from apps.media import images, tasks

    genre, title = comedy
    genre.artwork = ImageFactory(kind="artwork", status=S.PROCESSING)
    genre.save()
    _, by_slug = tiles(api)
    assert by_slug["comedy"]["sample"]["key"] == title.backdrop.key

    def fake_render(asset):
        asset.status = S.READY
        asset.save()

    monkeypatch.setattr(images, "render", fake_render)
    before = catalog_version()
    tasks.render_image.delay(str(genre.artwork_id))
    assert catalog_version() > before
    _, by_slug = tiles(api)
    assert by_slug["comedy"]["artwork"]["key"] == genre.artwork.key


def test_tiles_revalidate_with_an_etag(api, comedy, django_capture_on_commit_callbacks):
    res, _ = tiles(api)
    assert "no-cache" in res["Cache-Control"] and "public" in res["Cache-Control"]
    etag = res["ETag"]
    again = api.get("/api/v1/genres?translation=all", HTTP_IF_NONE_MATCH=etag)
    assert again.status_code == 304
    with django_capture_on_commit_callbacks(execute=True):
        GenreFactory(name="Drama").titles.add(comedy[1])  # any catalog change → new ETag
    changed, by_slug = tiles(api, HTTP_IF_NONE_MATCH=etag)
    assert changed["ETag"] != etag and "drama" in {g["name"].lower() for g in by_slug.values()}


def test_category_page_has_a_header_image(api, comedy):
    genre, title = comedy
    genre.description = "Laugh out loud."
    genre.artwork = ImageFactory(kind="artwork", status=S.FAILED)
    genre.save()
    body = api.get("/api/v1/genres/comedy/titles?translation=all").json()
    assert body["genre"]["name"] == "Comedy"
    assert body["genre"]["description"] == "Laugh out loud."
    assert body["genre"]["artwork"] is None
    assert body["genre"]["sample"]["key"] == title.backdrop.key
    genre.artwork = ImageFactory(kind="artwork", width=1280, height=720)
    genre.save()
    body = api.get("/api/v1/genres/comedy/titles?translation=all").json()
    assert body["genre"]["artwork"]["key"] == genre.artwork.key


def test_studio_retries_a_failed_or_stuck_render(content_manager_api, analyst_api, monkeypatch):
    import datetime as dt

    from django.utils import timezone

    from apps.core.models import AuditLog
    from apps.media import tasks

    queued = []
    monkeypatch.setattr(tasks.render_image, "delay", lambda pk: queued.append(pk))
    failed = ImageFactory(kind="artwork", status=S.FAILED, error="boom")
    url = f"/api/v1/admin/images/{failed.pk}/retry"
    assert analyst_api.post(url).status_code == 403
    res = content_manager_api.post(url)
    assert res.status_code == 200 and res.json()["status"] == "processing"
    assert res.json()["error"] == "" and queued == [str(failed.pk)]
    assert AuditLog.objects.filter(action="image.retry").exists()

    fresh = ImageFactory(kind="artwork", status=S.PROCESSING)
    assert content_manager_api.post(f"/api/v1/admin/images/{fresh.pk}/retry").status_code == 409
    ImageAsset.objects.filter(pk=fresh.pk).update(
        created_at=timezone.now() - dt.timedelta(minutes=5)
    )
    assert content_manager_api.post(f"/api/v1/admin/images/{fresh.pk}/retry").status_code == 200
    ready = ImageFactory(kind="artwork")
    assert content_manager_api.post(f"/api/v1/admin/images/{ready.pk}/retry").status_code == 409
