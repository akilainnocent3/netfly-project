"""A missing FFmpeg is the operator's problem: fail fast, clearly, permanently, before any download."""

import subprocess
from unittest import mock

import pytest

from apps.core.config import config
from apps.media import tasks
from apps.media import transcode as tc
from apps.media.models import VideoAsset

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _fresh_toolchain_cache():
    tc._toolchain_cache.clear()
    yield
    tc._toolchain_cache.clear()


@pytest.fixture
def no_ffmpeg(monkeypatch):
    """PATH without FFmpeg: `which` finds nothing and exec fails with ENOENT."""
    monkeypatch.setattr(tc.shutil, "which", lambda name: None)
    real_run, real_popen = subprocess.run, subprocess.Popen

    def missing(cmd, *args, **kwargs):
        if cmd[0] in ("ffmpeg", "ffprobe"):
            raise FileNotFoundError(2, "No such file or directory", cmd[0])
        return real_run(cmd, *args, **kwargs)

    def missing_popen(cmd, *args, **kwargs):
        if cmd[0] in ("ffmpeg", "ffprobe"):
            raise FileNotFoundError(2, "No such file or directory", cmd[0])
        return real_popen(cmd, *args, **kwargs)

    monkeypatch.setattr(tc.subprocess, "run", missing)
    monkeypatch.setattr(tc.subprocess, "Popen", missing_popen)


def _asset():
    return VideoAsset.objects.create(
        kind=VideoAsset.Kind.FEATURE,
        status=VideoAsset.Status.QUEUED,
        original_filename="In the Realm of the Senses.mp4",
        source_key="netfly/sources/x/source.mp4",
        source_size=545 * 1024 * 1024,
    )


def test_missing_ffprobe_fails_permanently_without_download_or_retry(no_ffmpeg):
    asset = _asset()
    with (
        mock.patch("apps.core.storage.download_file") as download,
        mock.patch.object(tasks.transcode_asset, "retry") as retry,
    ):
        tasks.transcode_asset.apply(args=[str(asset.pk)])

    asset.refresh_from_db()
    assert asset.status == VideoAsset.Status.FAILED
    assert "FFmpeg isn't installed on the transcoding worker" in asset.error
    assert "Errno" not in asset.error
    assert "No such file or directory" in asset.log  # the raw OS error is kept for operators
    download.assert_not_called()
    retry.assert_not_called()


def test_run_and_encode_wrap_missing_executable(no_ffmpeg):
    with pytest.raises(tc.MissingToolchain) as exc:
        tc.run(["ffprobe", "-version"])
    assert exc.value.permanent and exc.value.tool == "ffprobe"
    with pytest.raises(tc.MissingToolchain) as exc:
        tc.encode(["ffmpeg", "-version"], 1.0, lambda p: None)
    assert exc.value.tool == "ffmpeg"


def test_probe_reports_missing_tool_not_a_broken_file(no_ffmpeg, tmp_path):
    with pytest.raises(tc.MissingToolchain):
        tc.probe(str(tmp_path / "anything.mp4"))


def test_unreadable_file_still_reported_as_unreadable(tmp_path):
    junk = tmp_path / "junk.mp4"
    junk.write_bytes(b"definitely not a video" * 100)
    with pytest.raises(tc.TranscodeError) as exc:
        tc.probe(str(junk))
    assert not isinstance(exc.value, tc.MissingToolchain)
    assert str(exc.value) == "This file isn't a readable video."


def test_configured_paths_are_honoured(monkeypatch, tmp_path):
    config.set("transcoding.ffmpeg_path", "/opt/ffmpeg/bin/ffmpeg")
    config.set("transcoding.ffprobe_path", "/opt/ffmpeg/bin/ffprobe")
    assert tc.tool("ffmpeg") == "/opt/ffmpeg/bin/ffmpeg"
    assert tc.tool("ffprobe") == "/opt/ffmpeg/bin/ffprobe"
    from apps.media.transcode import Probe, Rung

    cmd = tc.ffmpeg_command(
        "src",
        tmp_path,
        Probe(10, 640, 360, 24, "h264", []),
        [Rung("360p", 360, 640, 700, 840, "h264")],
    )
    assert cmd[0] == "/opt/ffmpeg/bin/ffmpeg"

    calls = []
    monkeypatch.setattr(
        tc.subprocess,
        "run",
        lambda cmd, **kw: calls.append(cmd[0]) or subprocess.CompletedProcess(cmd, 0, "{}", ""),
    )
    with pytest.raises(tc.TranscodeError):
        tc.probe("x.mp4")  # empty JSON → no video stream; we only care which binary ran
    assert calls == ["/opt/ffmpeg/bin/ffprobe"]


def test_bogus_configured_path_names_the_right_tool():
    config.set("transcoding.ffprobe_path", "/nonexistent/probe-binary")
    status = tc.toolchain()
    assert not status["ok"] and status["missing"] == "ffprobe"
    assert "ffprobe path" in status["message"]


def test_working_toolchain_is_cached_per_process(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd[0])
        return subprocess.CompletedProcess(cmd, 0, f"{cmd[0]} version 6.1.1 Copyright", "")

    monkeypatch.setattr(tc.shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(tc.subprocess, "run", fake_run)
    first = tc.toolchain()
    second = tc.toolchain()
    assert first["ok"] and first["ffmpeg_version"] == "6.1.1"
    assert second is first
    assert calls == ["/usr/bin/ffmpeg", "/usr/bin/ffprobe"]


def test_broken_toolchain_is_rechecked(no_ffmpeg):
    assert not tc.toolchain()["ok"]
    assert tc._toolchain_cache == {}  # installing FFmpeg needs no worker restart


@pytest.mark.parametrize(
    ("replies", "state"),
    [
        ([], "no_worker"),
        ([{"celery@web": {"transcode": False}}], "no_worker"),
        (
            [
                {
                    "celery@vps": {
                        "transcode": True,
                        "ok": True,
                        "ffmpeg_version": "6.1",
                        "ffprobe_version": "6.1",
                        "message": "",
                    }
                }
            ],
            "ok",
        ),
        (
            [
                {
                    "celery@vps": {
                        "transcode": True,
                        "ok": False,
                        "ffmpeg_version": "",
                        "ffprobe_version": "",
                        "message": "FFmpeg isn't installed on the transcoding worker",
                    }
                }
            ],
            "missing",
        ),
    ],
)
def test_toolchain_endpoint(content_manager_api, replies, state):
    with mock.patch("netfly.celery.app.control.broadcast", return_value=replies) as broadcast:
        res = content_manager_api.get("/api/v1/admin/videos/toolchain")
    assert res.status_code == 200, res.content
    assert res.json()["state"] == state
    assert broadcast.call_args.kwargs["timeout"] <= 5
    if state == "ok":
        assert res.json()["message"] == "FFmpeg 6.1"


def test_toolchain_endpoint_requires_staff(auth_api):
    assert auth_api.get("/api/v1/admin/videos/toolchain").status_code in (401, 403)
