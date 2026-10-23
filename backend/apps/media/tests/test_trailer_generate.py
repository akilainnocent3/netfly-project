"""Studio → Video → Trailer → "Generate from video": cut a range of the title's own video into a
new trailer asset. Real FFmpeg against a real HTTP S3 (moto server), because FFmpeg itself reads
the source through a presigned URL."""

import subprocess

import boto3
import pytest

from apps.catalog.models import Title
from apps.core.config import config
from apps.core.models import AuditLog
from apps.media import tasks
from apps.media import transcode as tc
from apps.media.models import VideoAsset
from apps.recommendations.cache import catalog_version
from tests.factories import EpisodeFactory, SeasonFactory, SeriesFactory, TitleFactory

pytestmark = pytest.mark.django_db

SMALL_LADDER = [
    {"name": "360p", "height": 360, "video_kbps": 700, "codec": "h264"},
    {"name": "240p", "height": 240, "video_kbps": 350, "codec": "h264"},
]
BUCKET = "netfly-test"


@pytest.fixture(scope="module")
def source_mp4(tmp_path_factory):
    """20 s of testsrc2 (bright colour bars, never black) with a 440 Hz tone."""
    path = tmp_path_factory.mktemp("src") / "feature.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=640x360:rate=24:duration=20",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=20",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-g",
            "240",  # 10 s GOPs: a stream-copy cut at 5 s would snap back to 0 s
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ],
        check=True,
    )
    return path


@pytest.fixture
def s3_http(db):
    """An S3 that FFmpeg can reach over HTTP (moto's in-process mock can't serve a URL)."""
    from moto.server import ThreadedMotoServer

    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
    server.start()
    host, port = server.get_host_and_port()
    endpoint = f"http://{host}:{port}"
    client = boto3.client(
        "s3",
        region_name="us-east-1",
        endpoint_url=endpoint,
        aws_access_key_id="testing",
        aws_secret_access_key="testing",
    )
    client.create_bucket(Bucket=BUCKET)
    config.set("storage.s3.bucket", BUCKET)
    config.set("storage.s3.endpoint_url", endpoint)
    config.set("storage.s3.access_key_id", "testing")
    config.set("storage.s3.secret_access_key", "testing")
    config.set("transcoding.ladder", SMALL_LADDER)
    config.set("transcoding.preset", "ultrafast")
    config.set("transcoding.sprite_interval_seconds", 1)
    config.set("transcoding.max_retries", 0)
    config.set("trailer.min_seconds", 2)  # the 4 s cuts below sit under the 5 s default
    yield client
    server.stop()


def feature_asset(s3_http, source_mp4, **fields) -> VideoAsset:
    asset = VideoAsset.objects.create(
        kind="feature", status="ready", duration=20, source_width=640, source_height=360, **fields
    )
    key = f"netfly/sources/{asset.pk}/feature.mp4"
    s3_http.put_object(Bucket=BUCKET, Key=key, Body=source_mp4.read_bytes())
    VideoAsset.objects.filter(pk=asset.pk).update(source_key=key)
    asset.refresh_from_db()
    return asset


def fetch(s3_http, key: str, path) -> str:
    path.write_bytes(s3_http.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    return str(path)


def first_frame_luma(path: str) -> float:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-frames:v", "1", "-f", "rawvideo"]
        + ["-pix_fmt", "gray", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return sum(raw) / len(raw)


def generate(client, title, **body):
    return client.post(
        f"/api/v1/admin/titles/{title.pk}/trailer/generate",
        {"source": "feature", "start_seconds": 5.0, "end_seconds": 15.0, **body},
        format="json",
    )


def test_generates_a_ready_trailer_and_attaches_it(
    content_manager_api,
    auth_api,
    s3_http,
    source_mp4,
    monkeypatch,
    tmp_path,
    django_capture_on_commit_callbacks,
):
    feature = feature_asset(s3_http, source_mp4)
    title = TitleFactory(video=feature, trailer=None)
    version = catalog_version()

    commands, attached_while_encoding, downloads = [], [], []
    real_encode, real_download = tc.encode, tc.storage.download_file

    def spy_encode(cmd, duration, on_progress):
        commands.append(cmd)
        attached_while_encoding.append(Title.objects.get(pk=title.pk).trailer_id)
        return real_encode(cmd, duration, on_progress)

    def spy_download(key, path):
        downloads.append(key)
        return real_download(key, path)

    monkeypatch.setattr(tc, "encode", spy_encode)
    monkeypatch.setattr(tc.storage, "download_file", spy_download)

    with django_capture_on_commit_callbacks(execute=True):
        res = generate(content_manager_api, title, end_seconds=9.0)
    assert res.status_code == 201, res.json()
    asset = VideoAsset.objects.get(pk=res.json()["id"])
    assert res.json()["clip_of"] == str(feature.pk)
    assert (res.json()["clip_start"], res.json()["clip_end"]) == (5.0, 9.0)
    assert asset.status == "ready", (asset.error, asset.log[-800:])
    assert asset.kind == "trailer" and asset.original_filename.endswith("trailer 0:05–0:09.mp4")

    # A 4 s trailer with HLS, scrub sprites and a poster.
    assert asset.duration == pytest.approx(4.0, abs=0.1)
    clip = fetch(s3_http, asset.source_key, tmp_path / "clip.mp4")
    assert tc.probe(clip).duration == pytest.approx(4.0, abs=0.1)
    assert asset.source_key.endswith(f"sources/{asset.pk}/clip.mp4")
    assert asset.master_key and asset.renditions and asset.sprite["sheets"]
    assert asset.poster_frame_key
    keys = {o["Key"] for o in s3_http.list_objects_v2(Bucket=BUCKET)["Contents"]}
    assert asset.master_key in keys and asset.poster_frame_key in keys

    # The cut seeks the remote source with -ss before -i; the feature is never downloaded.
    cut = commands[0]
    assert cut.index("-ss") < cut.index("-i") < cut.index("-t")
    assert (
        cut[cut.index("-i") + 1].startswith("http")
        and "X-Amz-Signature" in cut[cut.index("-i") + 1]
    )
    assert feature.source_key not in downloads and downloads == [asset.source_key]

    # Attached only once ready; viewers' caches move on.
    assert attached_while_encoding == [None, None]
    title.refresh_from_db()
    assert title.trailer_id == asset.pk
    assert catalog_version() > version
    actions = list(
        AuditLog.objects.filter(target_id=str(title.pk)).values_list("action", flat=True)
    )
    assert "trailer.generate" in actions and "trailer.attach" in actions
    generated = AuditLog.objects.get(action="trailer.generate")
    assert generated.changes["source_asset"] == str(feature.pk)
    assert (generated.changes["start"], generated.changes["end"]) == (5.0, 9.0)

    # Viewers: the hero / hover preview now plays the generated trailer from its start.
    info = auth_api.get(f"/api/v1/playback/{title.slug}?preview=true").json()
    assert f"/stream/{asset.pk}/master.m3u8" in info["master_url"] and info["start_at"] == 0

    # Deleting the feature afterwards doesn't break the trailer: it owns its source.
    s3_http.delete_object(Bucket=BUCKET, Key=feature.source_key)
    feature.delete()
    asset.refresh_from_db()
    assert asset.clip_of_id is None and asset.status == "ready"
    retried = content_manager_api.post(f"/api/v1/admin/videos/{asset.pk}/retry")
    assert retried.status_code == 200, retried.json()
    asset.refresh_from_db()
    assert asset.status == "ready", asset.error
    assert auth_api.get(f"/api/v1/titles/{title.slug}").json()["title"]["has_preview"] is True


def test_fade_and_no_audio(content_manager_api, s3_http, source_mp4, tmp_path):
    title = TitleFactory(video=feature_asset(s3_http, source_mp4), trailer=None)
    res = generate(content_manager_api, title, end_seconds=9.0, fade=True, audio=False)
    asset = VideoAsset.objects.get(pk=res.json()["id"])
    assert asset.status == "ready", (asset.error, asset.log[-800:])
    assert asset.audio_tracks == []
    clip = fetch(s3_http, asset.source_key, tmp_path / "clip.mp4")
    assert tc.probe(clip).audio == []
    assert first_frame_luma(clip) < 20  # faded in from black (Y=16 in TV range)

    plain = TitleFactory(video=feature_asset(s3_http, source_mp4), trailer=None)
    res = generate(content_manager_api, plain, end_seconds=9.0, fade=False, audio=True)
    asset = VideoAsset.objects.get(pk=res.json()["id"])
    assert asset.status == "ready", asset.error
    clip = fetch(s3_http, asset.source_key, tmp_path / "plain.mp4")
    assert len(tc.probe(clip).audio) == 1 and asset.audio_tracks
    assert first_frame_luma(clip) > 60  # colour bars, not black


def test_failed_cut_retries_the_cut_then_transcodes(content_manager_api, s3_http, source_mp4):
    feature = feature_asset(s3_http, source_mp4)
    title = TitleFactory(video=feature, trailer=None)
    body = s3_http.get_object(Bucket=BUCKET, Key=feature.source_key)["Body"].read()
    s3_http.delete_object(Bucket=BUCKET, Key=feature.source_key)

    res = generate(content_manager_api, title, end_seconds=9.0)
    asset = VideoAsset.objects.get(pk=res.json()["id"])
    assert asset.status == "failed" and "gone from storage" in asset.error
    assert asset.source_key == ""
    assert Title.objects.get(pk=title.pk).trailer_id is None  # never attached

    s3_http.put_object(Bucket=BUCKET, Key=feature.source_key, Body=body)
    res = content_manager_api.post(f"/api/v1/admin/videos/{asset.pk}/retry")
    assert res.status_code == 200, res.json()
    asset.refresh_from_db()
    assert asset.status == "ready", asset.error
    assert Title.objects.get(pk=title.pk).trailer_id == asset.pk


def test_retry_picks_cut_or_transcode(content_manager_api, monkeypatch):
    from apps.adminapi import media_views

    calls = []
    monkeypatch.setattr(media_views, "queue_generate", lambda a: calls.append(("cut", a.pk)))
    monkeypatch.setattr(media_views, "queue_transcode", lambda a: calls.append(("hls", a.pk)))
    feature = VideoAsset.objects.create(kind="feature", status="ready", source_key="k")
    options = {"title_id": 1, "source": "feature", "fade": True, "audio": True}
    uncut = VideoAsset.objects.create(
        kind="trailer", status="failed", clip_of=feature, clip_options=options
    )
    cut = VideoAsset.objects.create(
        kind="trailer", status="failed", clip_of=feature, clip_options=options, source_key="c"
    )
    orphan = VideoAsset.objects.create(kind="trailer", status="failed", clip_options=options)
    for asset in (uncut, cut):
        assert content_manager_api.post(f"/api/v1/admin/videos/{asset.pk}/retry").status_code == 200
    assert calls == [("cut", uncut.pk), ("hls", cut.pk)]
    gone = content_manager_api.post(f"/api/v1/admin/videos/{orphan.pk}/retry")
    assert gone.status_code == 409 and gone.json()["code"] == "missing_source"


@pytest.fixture
def no_worker(monkeypatch):
    queued = []
    monkeypatch.setattr(
        "apps.adminapi.catalog_views.queue_generate", lambda asset: queued.append(asset.pk)
    )
    return queued


def ready_title(**video):
    feature = VideoAsset.objects.create(
        kind="feature",
        status=video.pop("status", "ready"),
        duration=video.pop("duration", 600),
        source_key="netfly/sources/x/feature.mp4",
        **video,
    )
    return TitleFactory(video=feature, trailer=None)


@pytest.mark.parametrize(
    ("start", "end", "message"),
    [
        (9, 9, "end must be after the start"),
        (20, 10, "end must be after the start"),
        (590, 601, "only 10:00 long"),
        (10, 13, "at least 0:05 long (0:03 selected)"),
        (0, 301, "at most 5:00 long (5:01 selected)"),
    ],
)
def test_rejects_bad_ranges(content_manager_api, no_worker, start, end, message):
    title = ready_title()
    res = generate(content_manager_api, title, start_seconds=start, end_seconds=end)
    assert res.status_code == 400 and res.json()["code"] == "invalid_range"
    assert message in res.json()["message"]
    assert no_worker == [] and not VideoAsset.objects.filter(kind="trailer").exists()


def test_length_limits_come_from_config(content_manager_api, no_worker):
    config.set("trailer.max_seconds", 10)
    res = generate(content_manager_api, ready_title(), start_seconds=0, end_seconds=15)
    assert res.status_code == 400 and "at most 0:10" in res.json()["message"]


def test_rejects_a_source_that_isnt_ready(content_manager_api, no_worker):
    res = generate(content_manager_api, ready_title(status="transcoding"))
    assert res.status_code == 400 and res.json()["code"] == "source_not_ready"
    assert res.json()["message"] == "Upload and finish processing the video first."
    no_video = TitleFactory(video=None, trailer=None)
    assert generate(content_manager_api, no_video).json()["code"] == "source_not_ready"


def test_series_needs_one_of_its_own_ready_episodes(content_manager_api, no_worker):
    series = SeriesFactory(trailer=None)
    episode = EpisodeFactory(season=SeasonFactory(title=series, number=1), number=1)
    VideoAsset.objects.filter(pk=episode.video_id).update(source_key="netfly/sources/e/ep.mp4")
    other = EpisodeFactory(season=SeasonFactory(title=SeriesFactory(), number=1), number=1)

    assert generate(content_manager_api, series).json()["code"] == "invalid_source"
    res = generate(content_manager_api, series, source={"episode_id": other.pk})
    assert res.status_code == 400 and res.json()["code"] == "invalid_source"

    res = generate(content_manager_api, series, source={"episode_id": episode.pk})
    assert res.status_code == 201, res.json()
    assert res.json()["clip_of"] == str(episode.video_id)
    assert res.json()["clip_options"]["label"] == "S1:E1"
    assert [str(pk) for pk in no_worker] == [res.json()["id"]]


def test_one_generation_at_a_time_and_progress_is_visible(content_manager_api, no_worker):
    title = ready_title()
    first = generate(content_manager_api, title)
    assert first.status_code == 201 and first.json()["status"] == "queued"
    assert first.json()["stage"] == "Waiting for a worker"
    second = generate(content_manager_api, title)
    assert second.status_code == 409 and second.json()["code"] == "busy"
    assert len(no_worker) == 1

    # Studio finds the job on the title until it is ready; the trailer itself is unchanged.
    detail = content_manager_api.get(f"/api/v1/admin/titles/{title.pk}").json()
    assert detail["trailer_id"] is None and detail["trailer_job"]["id"] == first.json()["id"]


def test_requires_edit_rights(analyst_api, content_manager_api, no_worker):
    title = ready_title()
    assert generate(analyst_api, title).status_code == 403
    assert no_worker == []


def test_missing_ffmpeg_is_a_clear_permanent_error(content_manager_api, monkeypatch):
    title = ready_title()
    monkeypatch.setattr(
        tc, "toolchain", lambda: {"ok": False, "missing": "ffmpeg", "log": "not found"}
    )
    res = generate(content_manager_api, title)
    asset = VideoAsset.objects.get(pk=res.json()["id"])
    assert asset.status == "failed" and "FFmpeg isn't installed" in asset.error
    assert asset.attempts == 1


def test_clip_command_shape():
    probe = tc.Probe(
        60,
        1920,
        800,
        23.976,
        "h264",
        [
            {"index": 1, "language": "fra", "default": False},
            {"index": 2, "language": "eng", "default": True},
        ],
    )
    cmd = tc.clip_command("https://s3/x?sig", tc.Path("o.mp4"), probe, 420, 120, fade=0.5)
    assert cmd[cmd.index("-ss") + 1] == "420.000" and cmd[cmd.index("-t") + 1] == "120.000"
    assert cmd[cmd.index("-crf") + 1] == "16" and "+faststart" in cmd
    assert "-map" in cmd and "0:2" in cmd and "0:1" not in cmd  # the default track only
    assert "fade=t=out:st=119.500:d=0.5" in cmd[cmd.index("-vf") + 1]
    assert "afade=t=in:st=0:d=0.5" in cmd[cmd.index("-af") + 1]
    assert "scale" not in " ".join(cmd)  # source size, rate and aspect kept
    silent = tc.clip_command("u", tc.Path("o.mp4"), probe, 0, 10, audio=False)
    assert "-an" in silent and "-vf" not in silent


def test_timecode():
    assert [tc.timecode(s) for s in (0, 5, 65, 420, 4020)] == [
        "0:00",
        "0:05",
        "1:05",
        "7:00",
        "1:07:00",
    ]


def test_generation_settings_are_registered():
    assert config.get_int("trailer.min_seconds") == 5
    assert config.get_int("trailer.max_seconds") == 300
    assert config.get_float("trailer.fade_seconds") == 0.5
    assert tasks.CUT_SHARE == 20
