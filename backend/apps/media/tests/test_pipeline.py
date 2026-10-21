import subprocess

import pytest

from apps.core.config import config
from apps.media import delivery
from apps.media.models import VideoAsset
from apps.media.transcode import Probe, build_ladder

pytestmark = pytest.mark.django_db

SMALL_LADDER = [
    {"name": "720p", "height": 720, "video_kbps": 2500, "codec": "h264"},
    {"name": "360p", "height": 360, "video_kbps": 700, "codec": "h264"},
    {"name": "240p", "height": 240, "video_kbps": 350, "codec": "h264"},
]


@pytest.fixture
def sample_video(tmp_path):
    path = tmp_path / "sample.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=640x360:rate=24:duration=6",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=6",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-shortest",
            "-metadata:s:a:0",
            "language=eng",
            str(path),
        ],
        check=True,
    )
    return path


def test_ladder_never_upscales_and_keeps_aspect():
    source = Probe(duration=60, width=1440, height=1080, fps=25, codec="h264", audio=[])
    rungs = build_ladder(source, SMALL_LADDER)
    assert [r.height for r in rungs] == [720, 360, 240]
    assert rungs[0].width == 960  # 4:3 kept
    tiny = build_ladder(Probe(10, 320, 180, 24, "h264", []), SMALL_LADDER)
    assert [(r.width, r.height) for r in tiny] == [(320, 180)]


def test_hevc_rungs_only_when_enabled():
    ladder = [
        *SMALL_LADDER,
        {"name": "360p-hevc", "height": 360, "video_kbps": 500, "codec": "hevc"},
    ]
    source = Probe(60, 1920, 1080, 24, "h264", [])
    assert all(r.codec == "h264" for r in build_ladder(source, ladder))
    config.set("transcoding.hevc_enabled", True)
    assert any(r.codec == "hevc" for r in build_ladder(source, ladder))


def test_upload_transcode_and_signed_delivery(content_manager_api, s3, sample_video, api):
    config.set("transcoding.ladder", SMALL_LADDER)
    config.set("transcoding.preset", "ultrafast")
    config.set("transcoding.sprite_interval_seconds", 2)
    data = sample_video.read_bytes()

    start = content_manager_api.post(
        "/api/v1/admin/uploads",
        {
            "filename": "sample.mp4",
            "size": len(data),
            "content_type": "video/mp4",
            "kind": "feature",
            "fingerprint": "sample-1",
        },
        format="json",
    )
    assert start.status_code == 201, start.json()
    session = start.json()
    assert session["part_count"] == 1 and session["completed_parts"] == []

    signed = content_manager_api.post(
        f"/api/v1/admin/uploads/{session['id']}/sign", {"numbers": [1]}, format="json"
    ).json()
    assert "uploadId=" in signed[0]["url"] or "UploadId=" in signed[0]["url"]

    # Resuming with the same fingerprint returns the same session.
    again = content_manager_api.post(
        "/api/v1/admin/uploads",
        {
            "filename": "sample.mp4",
            "size": len(data),
            "content_type": "video/mp4",
            "kind": "feature",
            "fingerprint": "sample-1",
        },
        format="json",
    ).json()
    assert again["id"] == session["id"]

    from apps.media.models import UploadSession

    upload = UploadSession.objects.get(pk=session["id"])
    part = s3.upload_part(
        Bucket="netfly-test", Key=upload.key, UploadId=upload.s3_upload_id, PartNumber=1, Body=data
    )
    resumed = content_manager_api.post(
        "/api/v1/admin/uploads",
        {
            "filename": "sample.mp4",
            "size": len(data),
            "content_type": "video/mp4",
            "kind": "feature",
            "fingerprint": "sample-1",
        },
        format="json",
    ).json()
    assert [p["number"] for p in resumed["completed_parts"]] == [1]

    done = content_manager_api.post(
        f"/api/v1/admin/uploads/{session['id']}/complete",
        {"parts": [{"number": 1, "etag": part["ETag"]}]},
        format="json",
    )
    assert done.status_code == 200, done.json()
    asset = VideoAsset.objects.get(pk=session["asset_id"])
    assert asset.status == "ready", (asset.error, asset.log[-800:])
    assert [r["height"] for r in asset.renditions] == [360, 240]  # 720p skipped: never upscale
    assert asset.audio_tracks and asset.audio_tracks[0]["language"] == "eng"
    assert asset.sprite["sheets"] and asset.duration == pytest.approx(6, abs=0.3)
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket="netfly-test", MaxKeys=1000)["Contents"]}
    assert any("/init_" in k and k.endswith(".mp4") for k in keys) and any(
        k.endswith(".m4s") for k in keys
    )

    token = delivery.issue_token(str(asset.pk), content_manager_api.user.pk)
    master = api.get(f"/api/v1/stream/{asset.pk}/master.m3u8?t={token}")
    assert master.status_code == 200
    body = master.content.decode()
    assert (
        body.count("#EXT-X-STREAM-INF") == 2
        and "TYPE=AUDIO" in body
        and "RESOLUTION=640x360" in body
    )
    capped = api.get(
        f"/api/v1/stream/{asset.pk}/master.m3u8?t={token}&max_height=240"
    ).content.decode()
    assert capped.count("#EXT-X-STREAM-INF") == 1

    media = api.get(f"/api/v1/stream/{asset.pk}/v0.m3u8?t={token}").content.decode()
    assert '#EXT-X-MAP:URI="https://' in media and "X-Amz-Signature=" in media
    assert all(
        line.startswith("https://")
        for line in media.splitlines()
        if line and not line.startswith("#")
    )
    assert (
        api.get(f"/api/v1/stream/{asset.pk}/v0.m3u8?t={token}")["Cache-Control"]
        == "private, max-age=60"
    )

    thumbs = api.get(f"/api/v1/stream/{asset.pk}/thumbs.vtt?t={token}").content.decode()
    assert thumbs.startswith("WEBVTT") and "#xywh=0,0," in thumbs

    other = VideoAsset.objects.create(status="ready")
    assert api.get(f"/api/v1/stream/{other.pk}/master.m3u8?t={token}").status_code == 403
    assert api.get(f"/api/v1/stream/{asset.pk}/master.m3u8?t=forged").status_code == 403


def test_rejects_non_video_after_upload(content_manager_api, s3):
    junk = b"this is not a video at all " * 400
    start = content_manager_api.post(
        "/api/v1/admin/uploads",
        {
            "filename": "movie.mp4",
            "size": len(junk),
            "content_type": "video/mp4",
            "kind": "feature",
            "fingerprint": "junk",
        },
        format="json",
    ).json()
    from apps.media.models import UploadSession

    upload = UploadSession.objects.get(pk=start["id"])
    part = s3.upload_part(
        Bucket="netfly-test", Key=upload.key, UploadId=upload.s3_upload_id, PartNumber=1, Body=junk
    )
    done = content_manager_api.post(
        f"/api/v1/admin/uploads/{start['id']}/complete",
        {"parts": [{"number": 1, "etag": part["ETag"]}]},
        format="json",
    )
    assert done.status_code == 415
    assert VideoAsset.objects.get(pk=start["asset_id"]).status == "failed"


def test_upload_limits(content_manager_api, s3):
    config.set("upload.max_video_size_gb", 0.001)
    too_big = content_manager_api.post(
        "/api/v1/admin/uploads",
        {
            "filename": "a.mp4",
            "size": 5 * 1024**2,
            "content_type": "video/mp4",
            "kind": "feature",
            "fingerprint": "x",
        },
        format="json",
    )
    assert too_big.status_code == 413
    wrong = content_manager_api.post(
        "/api/v1/admin/uploads",
        {
            "filename": "a.exe",
            "size": 100,
            "content_type": "application/x-msdownload",
            "kind": "feature",
            "fingerprint": "y",
        },
        format="json",
    )
    assert wrong.status_code == 415


def test_transcode_failure_is_reported(content_manager_api, s3):
    config.set("transcoding.max_retries", 0)
    asset = VideoAsset.objects.create(status="uploaded", source_key="netfly/sources/missing.mp4")
    s3.put_object(
        Bucket="netfly-test",
        Key="netfly/sources/missing.mp4",
        Body=b"\x00\x00\x00\x18ftypmp42 garbage",
    )
    from apps.media.tasks import queue_transcode

    queue_transcode(asset)
    asset.refresh_from_db()
    assert asset.status == "failed" and "readable video" in asset.error
    jobs = content_manager_api.get("/api/v1/admin/videos?status=failed").json()
    assert jobs["count"] == 1 and jobs["results"][0]["error"]


def test_srt_to_vtt():
    srt = "1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n"
    vtt = delivery.srt_to_vtt(srt)
    assert (
        vtt.startswith("WEBVTT") and "00:00:01.000 --> 00:00:02.500" in vtt and "\n1\n" not in vtt
    )


def test_long_ladder_stage_text_never_fails_the_job(s3, sample_video):
    # Regression: "Encoding 6 renditions (2160p, 1080p-high, …)" overflowed VideoAsset.stage.
    config.set(
        "transcoding.ladder",
        [
            {"name": f"240p-variant-{i}", "height": 240, "video_kbps": 200 + i, "codec": "h264"}
            for i in range(6)
        ],
    )
    config.set("transcoding.preset", "ultrafast")
    asset = VideoAsset.objects.create(status="uploaded", source_key="netfly/sources/long.mp4")
    s3.put_object(
        Bucket="netfly-test", Key="netfly/sources/long.mp4", Body=sample_video.read_bytes()
    )
    from apps.media.tasks import queue_transcode

    queue_transcode(asset)
    asset.refresh_from_db()
    assert asset.status == "ready", asset.error
    assert len(asset.renditions) >= 1
