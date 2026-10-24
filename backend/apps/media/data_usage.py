"""How much mobile data autoplay costs, from the live bitrate ladder (never hard-coded).

Shown in the autoplay warnings ("about X MB per minute of preview"). A preview is capped at
`PREVIEW_MAX_HEIGHT`, so it streams the best rung at or under that height; an autoplayed episode
can climb to the top rung (or the Data saver cap).
"""

from __future__ import annotations

from apps.core.config import config
from apps.core.config_defaults import DEFAULT_LADDER

PREVIEW_MAX_HEIGHT = 720  # previews and hero trailers never stream above this (decision 16)


def _kbps(max_height: int | None) -> int:
    ladder = config.get_json("transcoding.ladder", DEFAULT_LADDER) or DEFAULT_LADDER
    rungs = [r for r in ladder if not max_height or r.get("height", 0) <= max_height]
    if not rungs:  # every rung is taller than the cap: the player takes the smallest
        rungs = [min(ladder, key=lambda r: r.get("height", 0))]
    video = max(int(r.get("max_kbps") or r.get("video_kbps") or 0) for r in rungs)
    return video + config.get_int("transcoding.audio_bitrate_kbps", 160)


def mb_per_minute(max_height: int | None) -> int:
    """Megabytes per minute at the highest bitrate allowed under `max_height`, rounded up a
    little rather than down (a warning shouldn't understate it)."""
    megabytes = _kbps(max_height) * 60 / 8 / 1000
    return max(1, round(megabytes + 0.49))


def public_values() -> dict[str, int]:
    return {
        "playback.preview_max_height": PREVIEW_MAX_HEIGHT,
        "playback.preview_mb_per_minute": mb_per_minute(PREVIEW_MAX_HEIGHT),
        "playback.episode_mb_per_minute": mb_per_minute(None),
        "playback.data_saver_mb_per_minute": mb_per_minute(
            config.get_int("playback.data_saver_max_height", 480)
        ),
    }
