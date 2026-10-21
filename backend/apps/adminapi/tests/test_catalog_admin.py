import datetime as dt
import io

import pytest
from django.utils import timezone
from PIL import Image

from apps.catalog.models import Episode, RelatedTitle, Season, Title
from apps.catalog.tasks import enforce_licenses, publish_scheduled_titles
from apps.core.models import AuditLog
from apps.media.models import ImageAsset
from tests.factories import (
    EpisodeFactory,
    GenreFactory,
    ImageFactory,
    SeasonFactory,
    SeriesFactory,
    TitleFactory,
    VideoFactory,
)

pytestmark = pytest.mark.django_db


def test_viewers_cannot_use_admin_api(auth_api):
    assert auth_api.get("/api/v1/admin/titles").status_code == 403


def test_analyst_is_read_only(analyst_api):
    TitleFactory()
    assert analyst_api.get("/api/v1/admin/titles").status_code == 200
    created = analyst_api.post(
        "/api/v1/admin/titles",
        {"title": "X", "type": "movie", "translation_status": "translated"},
        format="json",
    )
    assert created.status_code == 403
    assert analyst_api.get("/api/v1/admin/config").status_code == 403


def test_create_title_generates_slug_and_audits(content_manager_api):
    genre = GenreFactory()
    response = content_manager_api.post(
        "/api/v1/admin/titles",
        {
            "title": "The Long Night",
            "type": "movie",
            "translation_status": "translated",
            "translator_name": "DJ Afro",
            "genre_ids": [genre.pk],
            "maturity_rating": "PG-13",
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["slug"] == "the-long-night" and body["status"] == "draft"
    assert body["publish_blockers"]
    assert AuditLog.objects.filter(action="title.create", target_id=str(body["id"])).exists()


def test_invalid_maturity_rating(content_manager_api):
    response = content_manager_api.post(
        "/api/v1/admin/titles",
        {
            "title": "X",
            "type": "movie",
            "translation_status": "translated",
            "maturity_rating": "XXX",
        },
        format="json",
    )
    assert response.status_code == 400 and "maturity_rating" in response.json()["fields"]


def test_update_records_field_diff(content_manager_api):
    title = TitleFactory(title="Old name")
    response = content_manager_api.patch(
        f"/api/v1/admin/titles/{title.pk}", {"title": "New name"}, format="json"
    )
    assert response.status_code == 200
    log = AuditLog.objects.get(action="title.update")
    assert log.changes["title"] == {"old": "Old name", "new": "New name"}


def test_moods_are_trimmed_and_capped(content_manager_api):
    title = TitleFactory()
    url = f"/api/v1/admin/titles/{title.pk}"
    ok = content_manager_api.patch(url, {"moods": [" Witty ", "Witty", "Dark"]}, format="json")
    assert ok.status_code == 200 and ok.json()["moods"] == ["Witty", "Dark"]
    too_many = content_manager_api.patch(url, {"moods": ["a", "b", "c", "d"]}, format="json")
    assert too_many.status_code == 400


def test_publish_blocked_without_rights_and_media(content_manager_api):
    title = TitleFactory(status=Title.Status.DRAFT, rights_holder="", poster=None, video=None)
    response = content_manager_api.post(f"/api/v1/admin/titles/{title.pk}/publish")
    assert response.status_code == 400
    assert "rights holder" in response.json()["fields"]["publish"]


def test_publish_waits_for_processing_video(content_manager_api):
    title = TitleFactory(
        status=Title.Status.DRAFT, video=VideoFactory(status="transcoding"), published_at=None
    )
    response = content_manager_api.post(f"/api/v1/admin/titles/{title.pk}/publish")
    assert response.json()["status"] == "processing"

    from apps.catalog.services import on_video_ready

    title.video.status = "ready"
    title.video.save()
    on_video_ready(title.video)
    title.refresh_from_db()
    assert title.status == "published" and title.published_at


def test_bulk_actions_skip_unpublishable(content_manager_api):
    ok = TitleFactory(status=Title.Status.DRAFT)
    bad = TitleFactory(status=Title.Status.DRAFT, rights_holder="")
    response = content_manager_api.post(
        "/api/v1/admin/titles/bulk", {"ids": [ok.pk, bad.pk], "action": "publish"}, format="json"
    )
    body = response.json()
    assert body["updated"] == [ok.pk] and str(bad.pk) in body["skipped"]
    featured = content_manager_api.post(
        "/api/v1/admin/titles/bulk", {"ids": [ok.pk, bad.pk], "action": "feature"}, format="json"
    )
    assert sorted(featured.json()["updated"]) == sorted([ok.pk, bad.pk])


def test_list_filters_and_search(content_manager_api):
    TitleFactory(title="Midnight Runner", translation_status="translated")
    TitleFactory(title="Morning Glory", translation_status="not_translated")
    SeriesFactory(title="Midnight Club")
    search = content_manager_api.get("/api/v1/admin/titles?search=midnite").json()
    assert {t["title"] for t in search["results"]} >= {"Midnight Runner", "Midnight Club"}
    only = content_manager_api.get("/api/v1/admin/titles?translation=not_translated").json()
    assert [t["title"] for t in only["results"]] == ["Morning Glory"]
    series = content_manager_api.get("/api/v1/admin/titles?type=series").json()
    assert series["count"] == 1


def test_related_titles_are_symmetric_unless_one_way(content_manager_api):
    a, b, c = TitleFactory(), TitleFactory(), TitleFactory()
    two_way = content_manager_api.post(
        f"/api/v1/admin/titles/{a.pk}/related", {"related_id": b.pk, "weight": 4}, format="json"
    )
    assert two_way.status_code == 201
    assert RelatedTitle.objects.filter(title=b, related=a, weight=4).exists()
    content_manager_api.post(
        f"/api/v1/admin/titles/{a.pk}/related",
        {"related_id": c.pk, "weight": 2, "two_way": False},
        format="json",
    )
    assert not RelatedTitle.objects.filter(title=c, related=a).exists()
    listing = content_manager_api.get(f"/api/v1/admin/titles/{a.pk}/related").json()
    assert {(r["related"]["id"], r["is_two_way"]) for r in listing} == {(b.pk, True), (c.pk, False)}
    link = RelatedTitle.objects.get(title=a, related=b)
    content_manager_api.patch(f"/api/v1/admin/related/{link.pk}", {"weight": 5}, format="json")
    assert RelatedTitle.objects.get(title=b, related=a).weight == 5
    assert content_manager_api.delete(f"/api/v1/admin/related/{link.pk}").status_code == 204
    assert not RelatedTitle.objects.filter(title=b, related=a).exists()


def test_cannot_relate_to_self(content_manager_api):
    a = TitleFactory()
    response = content_manager_api.post(
        f"/api/v1/admin/titles/{a.pk}/related", {"related_id": a.pk, "weight": 3}, format="json"
    )
    assert response.status_code == 400


def test_seasons_and_episodes_auto_number_and_reorder(content_manager_api):
    series = SeriesFactory()
    s1 = content_manager_api.post(
        f"/api/v1/admin/seasons?title={series.pk}", {"name": ""}, format="json"
    ).json()
    s2 = content_manager_api.post(
        f"/api/v1/admin/seasons?title={series.pk}", {}, format="json"
    ).json()
    assert (s1["number"], s2["number"]) == (1, 2)
    e = [
        content_manager_api.post(
            f"/api/v1/admin/seasons/{s1['id']}/episodes", {"name": f"Ep {i}"}, format="json"
        ).json()
        for i in range(3)
    ]
    assert [x["number"] for x in e] == [1, 2, 3]
    order = [e[2]["id"], e[0]["id"], e[1]["id"]]
    assert (
        content_manager_api.post(
            f"/api/v1/admin/seasons/{s1['id']}/reorder-episodes", {"ids": order}, format="json"
        ).status_code
        == 204
    )
    assert (
        list(
            Episode.objects.filter(season_id=s1["id"])
            .order_by("number")
            .values_list("id", flat=True)
        )
        == order
    )
    swap = content_manager_api.post(
        f"/api/v1/admin/seasons/reorder?title={series.pk}",
        {"ids": [s2["id"], s1["id"]]},
        format="json",
    )
    assert swap.status_code == 204 and Season.objects.get(pk=s2["id"]).number == 1
    tree = content_manager_api.get(f"/api/v1/admin/titles/{series.pk}/seasons").json()
    assert [len(s["episodes"]) for s in tree] == [0, 3]


def test_intro_markers_validated(content_manager_api):
    episode = EpisodeFactory()
    bad = content_manager_api.patch(
        f"/api/v1/admin/episodes/{episode.pk}", {"intro_start": 30, "intro_end": 10}, format="json"
    )
    assert bad.status_code == 400 and "intro_end" in bad.json()["fields"]
    ok = content_manager_api.patch(
        f"/api/v1/admin/episodes/{episode.pk}",
        {"intro_start": 5, "intro_end": 65, "credits_start": 2400},
        format="json",
    )
    assert ok.status_code == 200


def test_image_kind_must_match_slot(content_manager_api):
    title = TitleFactory()
    backdrop = ImageFactory(kind="backdrop")
    response = content_manager_api.patch(
        f"/api/v1/admin/titles/{title.pk}", {"poster_id": str(backdrop.pk)}, format="json"
    )
    assert response.status_code == 400 and "poster_id" in response.json()["fields"]


def test_genre_reorder(content_manager_api):
    a, b = GenreFactory(), GenreFactory()
    reorder = content_manager_api.post(
        "/api/v1/admin/genres/reorder", {"ids": [b.pk, a.pk]}, format="json"
    )
    assert reorder.status_code == 204, reorder.content
    assert [g["id"] for g in content_manager_api.get("/api/v1/admin/genres").json()] == [b.pk, a.pk]


def _png(width, height, color=(200, 40, 60)):
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, "PNG")
    buffer.seek(0)
    buffer.name = "poster.png"
    return buffer


def test_image_upload_renders_variants(content_manager_api, s3):
    response = content_manager_api.post(
        "/api/v1/admin/images", {"file": _png(1000, 1500), "kind": "poster"}, format="multipart"
    )
    assert response.status_code == 201, response.json()
    asset = ImageAsset.objects.get(pk=response.json()["id"])
    assert asset.status == "ready"  # tasks run eagerly in tests
    assert asset.widths == [160, 320, 480, 640, 960, 1000]
    assert set(asset.formats) >= {"webp"}
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket="netfly-test")["Contents"]}
    assert f"netfly/{asset.key}/w640.webp" in keys
    assert asset.blur_data_url.startswith("data:image/webp;base64,")


def test_image_crop_rerenders_new_version(content_manager_api, s3):
    asset_id = content_manager_api.post(
        "/api/v1/admin/images", {"file": _png(1920, 1080), "kind": "backdrop"}, format="multipart"
    ).json()["id"]
    response = content_manager_api.patch(
        f"/api/v1/admin/images/{asset_id}",
        {"crop": {"x": 0.1, "y": 0.1, "w": 0.5, "h": 0.5}},
        format="json",
    )
    assert response.status_code == 200
    asset = ImageAsset.objects.get(pk=asset_id)
    assert asset.version == 2 and asset.width == 960 and asset.status == "ready"


def test_image_upload_rejects_non_images(content_manager_api, s3):
    fake = io.BytesIO(b"#!/bin/sh\necho hi\n" * 50)
    fake.name = "poster.png"
    response = content_manager_api.post(
        "/api/v1/admin/images", {"file": fake, "kind": "poster"}, format="multipart"
    )
    assert response.status_code == 415


def test_image_upload_rejects_tiny_backdrop(content_manager_api, s3):
    response = content_manager_api.post(
        "/api/v1/admin/images", {"file": _png(300, 200), "kind": "backdrop"}, format="multipart"
    )
    assert response.status_code == 400 and response.json()["code"] == "image_too_small"


def test_image_redirect_is_signed_and_cacheable(api, content_manager_api, s3):
    asset_id = content_manager_api.post(
        "/api/v1/admin/images", {"file": _png(1000, 1500), "kind": "poster"}, format="multipart"
    ).json()["id"]
    asset = ImageAsset.objects.get(pk=asset_id)
    response = api.get(f"/api/v1/img/{asset.key}/w500", HTTP_ACCEPT="image/avif,image/webp")
    assert response.status_code == 302
    assert "X-Amz-Signature=" in response["Location"] and "/w640." in response["Location"]
    assert "max-age" in response["Cache-Control"]
    again = api.get(f"/api/v1/img/{asset.key}/w500", HTTP_ACCEPT="image/avif,image/webp")
    assert again["Location"] == response["Location"]  # time-bucketed signature


def test_scheduled_publish_and_license_expiry():
    now = timezone.now()
    scheduled = TitleFactory(
        status=Title.Status.DRAFT, publish_at=now - dt.timedelta(minutes=1), published_at=None
    )
    expired = TitleFactory(license_end=now - dt.timedelta(hours=1))
    expiring = TitleFactory(license_end=now + dt.timedelta(days=3))
    assert publish_scheduled_titles() == 1
    scheduled.refresh_from_db()
    assert scheduled.status == "published"
    result = enforce_licenses()
    assert result["expired"] == [expired.pk] and result["warned"] == [expiring.pk]
    expired.refresh_from_db()
    assert expired.status == "archived"
    assert enforce_licenses()["warned"] == []  # warn once


def test_series_cannot_take_a_feature_video(content_manager_api):
    series = SeriesFactory()
    video = VideoFactory()
    response = content_manager_api.patch(
        f"/api/v1/admin/titles/{series.pk}", {"video_id": str(video.pk)}, format="json"
    )
    assert response.status_code == 400


def test_series_publish_requires_episode_video(content_manager_api):
    season = SeasonFactory(title=SeriesFactory(status=Title.Status.DRAFT))
    blockers = content_manager_api.get(f"/api/v1/admin/titles/{season.title_id}").json()[
        "publish_blockers"
    ]
    assert any("episode" in b for b in blockers)
    EpisodeFactory(season=season)
    assert (
        content_manager_api.post(f"/api/v1/admin/titles/{season.title_id}/publish").json()["status"]
        == "published"
    )
