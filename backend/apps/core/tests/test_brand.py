import subprocess

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.core.config import ConfigValidationError, config

pytestmark = pytest.mark.django_db


def _clip(tmp_path, seconds=2, codec="libx264"):
    path = tmp_path / "intro.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"testsrc2=size=320x180:rate=24:duration={seconds}",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:duration={seconds}",
            "-c:v",
            codec,
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-shortest",
            str(path),
        ],
        check=True,
    )
    return path.read_bytes()


def test_intro_defaults_are_public(api):
    values = api.get("/api/public/config").json()["values"]
    assert values["intro.enabled"] is True
    assert values["intro.video_url_1080"] == "/brand/netfly-intro-1080p.v1.mp4"
    assert values["intro.video_url_720"] == "/brand/netfly-intro-720p.v1.mp4"
    assert values["intro.app_open_frequency"] == "once_per_session"
    assert values["intro.before_playback"] == "always"
    assert values["intro.on_autoplay_next_episode"] is False
    assert values["intro.skippable"] is True


@pytest.mark.parametrize(
    "bad",
    [
        "//evil.example/x.mp4",
        "http://plain.example/x.mp4",
        "javascript:alert(1)",
        "https://a.example;script-src *",
        "/brand/a b.mp4",
    ],
)
def test_intro_url_rejects_unsafe_values(bad):
    with pytest.raises(ConfigValidationError):
        config.set("intro.video_url_1080", bad)


def test_external_intro_origin_is_added_to_csp_origins(api):
    config.set("intro.video_url_1080", "https://cdn.example.com/ident.mp4")
    origins = api.get("/api/public/config").json()["values"]["media_origins"]
    assert "https://cdn.example.com" in origins


def test_upload_replaces_intro_and_redirect_serves_it(staff_api, api, s3, tmp_path):
    data = _clip(tmp_path)
    res = staff_api.post(
        "/api/v1/admin/brand/intro",
        {"file": SimpleUploadedFile("ident.mp4", data, "video/mp4"), "variant": "720"},
        format="multipart",
    )
    assert res.status_code == 200, res.json()
    url = res.json()["url"]
    assert url.startswith("/api/v1/brand/intro/") and url.endswith("-720.mp4")
    assert config.get_str("intro.video_url_720") == url
    redirect = api.get(url)
    assert redirect.status_code == 302
    assert "branding/intro/" in redirect["Location"]
    assert "max-age" in redirect["Cache-Control"]


def test_upload_rejects_non_mp4_and_long_clips(staff_api, s3, tmp_path):
    res = staff_api.post(
        "/api/v1/admin/brand/intro",
        {
            "file": SimpleUploadedFile("x.mp4", b"not a video at all", "video/mp4"),
            "variant": "1080",
        },
        format="multipart",
    )
    assert res.status_code == 415
    long = _clip(tmp_path, seconds=16)
    res = staff_api.post(
        "/api/v1/admin/brand/intro",
        {"file": SimpleUploadedFile("long.mp4", long, "video/mp4"), "variant": "1080"},
        format="multipart",
    )
    assert res.status_code == 400
    assert config.get_str("intro.video_url_1080") == "/brand/netfly-intro-1080p.v1.mp4"


def test_upload_is_superadmin_only(content_manager_api, s3, tmp_path):
    res = content_manager_api.post(
        "/api/v1/admin/brand/intro",
        {"file": SimpleUploadedFile("i.mp4", _clip(tmp_path), "video/mp4"), "variant": "1080"},
        format="multipart",
    )
    assert res.status_code == 403


def test_redirect_rejects_unknown_names(api, s3):
    assert api.get("/api/v1/brand/intro/../../secrets.mp4").status_code == 404
    assert api.get("/api/v1/brand/intro/nothex-1080.mp4").status_code == 404
