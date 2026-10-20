"""Signed HLS delivery.

The browser gets a short-lived, user-bound token. Playlists are served by the
API (tiny, `private, max-age` short) and every segment / init / sprite URI in
them is rewritten to a time-bucketed signed S3 (or CloudFront) URL, so links
can't be shared and segments stay cacheable for a long time.
"""

from __future__ import annotations

import re

from django.core import signing
from django.core.cache import cache

from apps.core import storage
from apps.core.config import config

from .models import VideoAsset

SALT = "netfly.playback"


def issue_token(asset_id: str, user_id: int) -> str:
    return signing.dumps({"a": str(asset_id), "u": user_id}, salt=SALT, compress=True)


def check_token(token: str, asset_id: str) -> int | None:
    ttl = config.get_int("storage.signed_url_ttl_seconds", 21600)
    try:
        payload = signing.loads(token, salt=SALT, max_age=ttl)
    except signing.BadSignature:
        return None
    return payload["u"] if payload.get("a") == str(asset_id) else None


def _key_from_full(full_key: str) -> str:
    return full_key.removeprefix(storage.s3_settings().prefix)


def _signed(full_key: str) -> str:
    return storage.presign_get(_key_from_full(full_key))


def master_playlist(asset: VideoAsset, token: str, *, max_height: int | None = None) -> str:
    lines = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-INDEPENDENT-SEGMENTS"]
    t = f"?t={token}"
    has_audio = bool(asset.audio_tracks)
    for i, track in enumerate(asset.audio_tracks):
        lines.append(
            f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="{_label(track["language"], track.get("name"))}",'
            f'LANGUAGE="{track["language"]}",AUTOSELECT=YES,DEFAULT={"YES" if i == 0 else "NO"},'
            f'CHANNELS="2",URI="a{i}.m3u8{t}"'
        )
    subs = list(asset.subtitles.all())
    for sub in subs:
        lines.append(
            f'#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="{sub.label}",LANGUAGE="{sub.language}",'
            f'AUTOSELECT=YES,DEFAULT={"YES" if sub.is_default else "NO"},FORCED={"YES" if sub.is_forced else "NO"},'
            f'URI="s{sub.pk}.m3u8{t}"'
        )
    for i, r in enumerate(asset.renditions):
        if max_height and r["height"] > max_height:
            continue
        attrs = [
            f"BANDWIDTH={r['bandwidth']}",
            f"AVERAGE-BANDWIDTH={r['avg_bandwidth']}",
            f'CODECS="{r["codecs"]}"',
            f"RESOLUTION={r['width']}x{r['height']}",
        ]
        if asset.source_fps:
            attrs.append(f"FRAME-RATE={asset.source_fps:.3f}")
        if has_audio:
            attrs.append('AUDIO="aud"')
        if subs:
            attrs.append('SUBTITLES="subs"')
        lines += [f"#EXT-X-STREAM-INF:{','.join(attrs)}", f"v{i}.m3u8{t}"]
    return "\n".join(lines) + "\n"


def _label(language: str, name: str | None) -> str:
    names = {"en": "English", "eng": "English", "sw": "Swahili", "swa": "Swahili", "fr": "French", "fre": "French", "und": "Original"}
    return names.get(language, name or language)


def _raw_playlist(full_key: str) -> str:
    cache_key = f"hls:raw:{full_key}"
    text = cache.get(cache_key)
    if text is None:
        text = storage.get_bytes(_key_from_full(full_key)).decode()
        cache.set(cache_key, text, 86400)  # renditions are immutable per transcode attempt
    return text


URI_ATTR = re.compile(r'URI="([^"]+)"')


def media_playlist(asset: VideoAsset, rel_path: str) -> str:
    """Rewrite a rendition playlist so every URI is a signed absolute URL."""
    base = f"{asset.hls_prefix}/{rel_path.rsplit('/', 1)[0]}"
    text = _raw_playlist(f"{asset.hls_prefix}/{rel_path}")
    out = []
    for line in text.splitlines():
        if line.startswith("#EXT-X-MAP:"):
            line = URI_ATTR.sub(lambda m: f'URI="{_signed(f"{base}/{m.group(1)}")}"', line)
        elif line and not line.startswith("#"):
            line = _signed(f"{base}/{line}")
        out.append(line)
    return "\n".join(out) + "\n"


def subtitle_playlist(asset: VideoAsset, sub) -> str:
    duration = max(1, int(asset.duration + 0.999))
    return "\n".join(
        [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            f"#EXT-X-TARGETDURATION:{duration}",
            "#EXT-X-MEDIA-SEQUENCE:0",
            "#EXT-X-PLAYLIST-TYPE:VOD",
            f"#EXTINF:{asset.duration:.3f},",
            _signed(sub.key),
            "#EXT-X-ENDLIST",
        ]
    ) + "\n"


def _ts(seconds: float) -> str:
    h, rem = divmod(max(0.0, seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def thumbnails_vtt(asset: VideoAsset) -> str:
    sprite = asset.sprite or {}
    if not sprite.get("sheets"):
        return "WEBVTT\n"
    interval, cols, rows = sprite["interval"], sprite["columns"], sprite["rows"]
    w, h = sprite["width"], sprite["height"]
    per_sheet = cols * rows
    urls = [_signed(f"{asset.hls_prefix}/{sprite.get('prefix', 'thumbs')}/{name}") for name in sprite["sheets"]]
    lines = ["WEBVTT", ""]
    count = sprite.get("count") or per_sheet * len(urls)
    for i in range(count):
        sheet = i // per_sheet
        if sheet >= len(urls):
            break
        cell = i % per_sheet
        x, y = (cell % cols) * w, (cell // cols) * h
        start, end = i * interval, min((i + 1) * interval, asset.duration or (i + 1) * interval)
        lines += [f"{_ts(start)} --> {_ts(end)}", f"{urls[sheet]}#xywh={x},{y},{w},{h}", ""]
    return "\n".join(lines)


def srt_to_vtt(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("﻿")
    if text.startswith("WEBVTT"):
        return text
    body = re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", text)
    body = re.sub(r"^\d+\n(?=\d{2}:\d{2}:\d{2}\.\d{3} -->)", "", body, flags=re.MULTILINE)
    return "WEBVTT\n\n" + body.strip() + "\n"
