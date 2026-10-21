"""Brand intro clips: admin replacement upload + a cacheable redirect to the private bucket.

The built-in clips ship with the client (`/brand/*.v1.mp4`). A replacement is
validated with ffprobe, stored once under a content hash (so the URL is
immutable) and served through `/api/v1/brand/intro/<name>.mp4`, which 302s to a
signed S3/CDN URL — the bucket stays private, exactly like images.
"""

from __future__ import annotations

import hashlib
import re
import tempfile

from django.http import HttpResponseRedirect, JsonResponse
from django.utils.cache import patch_cache_control
from django.views import View

from . import storage
from .config import config
from .exceptions import APIError

INTRO_NAME = re.compile(r"^[0-9a-f]{16}-(1080|720)$")
INTRO_MAX_BYTES = 20 * 1024 * 1024
INTRO_MAX_SECONDS = 15.0
VARIANTS = {"1080": "intro.video_url_1080", "720": "intro.video_url_720"}


def intro_key(name: str) -> str:
    return f"branding/intro/{name}.mp4"


def store_intro(upload, variant: str, *, actor, ip: str | None) -> str:
    """Validate an uploaded MP4 and make it the intro for `variant`. Returns the new URL."""
    from apps.media.transcode import TranscodeError, probe

    if variant not in VARIANTS:
        raise APIError("Variant must be 1080 or 720.", "validation_error", fields={"variant": "?"})
    if not storage.is_configured():
        raise APIError(
            "Storage isn't configured yet. Add your S3 bucket in Settings → Storage & CDN.",
            "storage_not_configured",
            409,
        )
    if upload.size > INTRO_MAX_BYTES:
        raise APIError("The intro must be at most 20 MB.", "file_too_large", 413)
    data = upload.read(INTRO_MAX_BYTES + 1)
    if len(data) > INTRO_MAX_BYTES:
        raise APIError("The intro must be at most 20 MB.", "file_too_large", 413)
    # MP4/MOV family only ("ftyp" box at offset 4): browsers play these without MSE.
    if data[4:8] != b"ftyp":
        raise APIError("Upload an MP4 file (H.264 video, AAC audio).", "invalid_video", 415)
    with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
        tmp.write(data)
        tmp.flush()
        try:
            info = probe(tmp.name)
        except TranscodeError as exc:
            raise APIError(str(exc), "invalid_video", 415) from exc
    if info.codec != "h264":
        raise APIError(
            "The intro must be H.264 video so every browser can play it.", "invalid_video", 415
        )
    if info.duration > INTRO_MAX_SECONDS:
        raise APIError(
            f"Keep the intro under {INTRO_MAX_SECONDS:g} seconds.", "validation_error", 400
        )
    name = f"{hashlib.sha256(data).hexdigest()[:16]}-{variant}"
    storage.put_bytes(intro_key(name), data, "video/mp4")
    url = f"/api/v1/brand/intro/{name}.mp4"
    config.set(VARIANTS[variant], url, actor=actor, ip=ip)
    return url


class IntroRedirectView(View):
    """`/api/v1/brand/intro/<hash>-<variant>.mp4` → 302 to a signed URL (content-addressed)."""

    def get(self, request, name: str):
        if not INTRO_NAME.match(name) or not storage.is_configured():
            return JsonResponse({"code": "not_found", "message": "Not found."}, status=404)
        ttl = config.get_int("storage.image_url_ttl_seconds", 604800)
        response = HttpResponseRedirect(storage.presign_get(intro_key(name), ttl))
        patch_cache_control(response, public=True, max_age=max(60, ttl // 8))
        return response
