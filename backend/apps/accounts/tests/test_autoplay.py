"""Autoplay settings: the default for new accounts, and the data figures the warnings show."""

import pytest

from apps.core.config import config
from apps.media.data_usage import PREVIEW_MAX_HEIGHT, mb_per_minute

pytestmark = pytest.mark.django_db


def signup(api, username):
    return api.post(
        "/api/v1/auth/signup",
        {
            "username": username,
            "full_name": "A Viewer",
            "password": "correct-horse-9",
            "app": "client",
        },
        format="json",
    )


@pytest.mark.parametrize("default", [True, False])
def test_new_accounts_follow_the_studio_default(api, default):
    config.set("playback.autoplay_default", default)
    assert signup(api, f"auto_{int(default)}").status_code == 201
    from apps.accounts.models import User

    user = User.objects.get(username=f"auto_{int(default)}")
    assert user.autoplay_next is default and user.autoplay_previews is default


def test_viewers_toggle_their_own_settings(auth_api):
    res = auth_api.patch("/api/v1/auth/me", {"autoplay_previews": False}, format="json")
    assert res.status_code == 200 and res.json()["autoplay_previews"] is False
    assert auth_api.get("/api/v1/auth/me").json()["autoplay_next"] is True


def test_data_figures_come_from_the_ladder(api):
    values = api.get("/api/public/config").json()["values"]
    # Default ladder: 720p peaks at 3600 kbps + 160 kbps audio ≈ 28.2 MB/min → shown as 29.
    assert values["playback.preview_max_height"] == PREVIEW_MAX_HEIGHT == 720
    assert values["playback.preview_mb_per_minute"] == 29
    assert values["playback.episode_mb_per_minute"] == mb_per_minute(None) == 152
    config.set(
        "transcoding.ladder",
        [
            {"name": "1080p", "height": 1080, "video_kbps": 5000, "codec": "h264"},
            {"name": "540p", "height": 540, "video_kbps": 1800, "codec": "h264"},
        ],
    )
    values = api.get("/api/public/config").json()["values"]
    assert values["playback.preview_mb_per_minute"] == round((1800 + 160) * 60 / 8000 + 0.49)
    assert values["playback.autoplay_default"] is True
