"""Image ingest: validate, store the original, render fixed-width AVIF/WebP variants."""

from __future__ import annotations

import base64
import io
import uuid

import filetype
from PIL import Image, ImageOps, features

from apps.core import storage
from apps.core.config import config
from apps.core.exceptions import APIError

from .models import ImageAsset

WIDTHS = [160, 320, 480, 640, 960, 1280, 1920, 2560]
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/heic"}
MIN_SIZE = {"poster": (300, 450), "backdrop": (960, 540), "thumbnail": (480, 270), "artwork": (480, 270), "logo": (200, 50)}
Image.MAX_IMAGE_PIXELS = 80_000_000  # decompression-bomb guard


def ingest(upload, kind: str, user=None) -> ImageAsset:
    """Validate an uploaded image file and queue rendering. Raises APIError with plain messages."""
    if kind not in ImageAsset.Kind.values:
        raise APIError("Unknown image type.", "validation_error")
    if not storage.is_configured():
        raise APIError("Storage isn't configured yet. Add your S3 bucket in Settings → Storage & CDN.", "storage_not_configured", 409)
    max_mb = config.get_int("upload.max_image_size_mb", 20)
    if upload.size > max_mb * 1024 * 1024:
        raise APIError(f"Images can be at most {max_mb} MB.", "file_too_large", 413)
    data = upload.read()
    sniffed = filetype.guess(data)
    if sniffed is None or sniffed.mime not in ALLOWED_MIME:
        raise APIError("That file isn't a supported image (JPEG, PNG, WebP or AVIF).", "invalid_image", 415)
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
    except (Image.DecompressionBombError, OSError, SyntaxError) as exc:
        raise APIError("That image couldn't be read. Try exporting it again.", "invalid_image", 415) from exc
    min_w, min_h = MIN_SIZE.get(kind, (1, 1))
    if image.width < min_w or image.height < min_h:
        raise APIError(f"This image is too small. Use at least {min_w}×{min_h} pixels.", "image_too_small")

    # Re-encode the original server-side (strips metadata, normalises the format).
    asset_id = uuid.uuid4()
    original = io.BytesIO()
    keep_alpha = image.mode in ("RGBA", "LA", "P") and kind == "logo"
    if keep_alpha:
        image.convert("RGBA").save(original, "PNG", optimize=True)
        ext, mime = "png", "image/png"
    else:
        image.convert("RGB").save(original, "JPEG", quality=94, optimize=True)
        ext, mime = "jpg", "image/jpeg"
    key = storage.put_bytes(f"images/{asset_id}/original.{ext}", original.getvalue(), mime, storage.LONG_CACHE)
    asset = ImageAsset.objects.create(
        id=asset_id,
        kind=kind,
        original_key=key,
        original_width=image.width,
        original_height=image.height,
        crop=default_crop(kind, image.width, image.height),
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )
    from .tasks import render_image

    render_image.delay(str(asset.id))
    return asset


def default_crop(kind: str, width: int, height: int) -> dict:
    """Centre crop to the kind's aspect ratio (posters 2:3, backdrops 16:9)."""
    aspect = ImageAsset.ASPECTS.get(kind)
    if not aspect or not width or not height:
        return {"x": 0, "y": 0, "w": 1, "h": 1}
    current = width / height
    if current > aspect:
        w = aspect / current
        return {"x": round((1 - w) / 2, 5), "y": 0, "w": round(w, 5), "h": 1}
    h = current / aspect
    return {"x": 0, "y": round((1 - h) / 2, 5), "w": 1, "h": round(h, 5)}


def _crop_box(crop: dict, width: int, height: int) -> tuple[int, int, int, int]:
    x = max(0.0, min(1.0, float(crop.get("x", 0))))
    y = max(0.0, min(1.0, float(crop.get("y", 0))))
    w = max(0.01, min(1.0 - x, float(crop.get("w", 1))))
    h = max(0.01, min(1.0 - y, float(crop.get("h", 1))))
    return round(x * width), round(y * height), round((x + w) * width), round((y + h) * height)


def render(asset: ImageAsset) -> None:
    raw = storage.get_bytes(asset.original_key)
    image = Image.open(io.BytesIO(raw))
    image.load()
    keep_alpha = asset.kind == "logo"
    image = image.convert("RGBA" if keep_alpha else "RGB")
    image = image.crop(_crop_box(asset.crop or {}, image.width, image.height))

    widths = [w for w in WIDTHS if w <= image.width] or [image.width]
    if image.width > widths[-1] and image.width < 2560 and widths[-1] != image.width:
        widths.append(image.width)  # keep full resolution for mid-size sources
    formats = ["webp"] + (["avif"] if features.check("avif") else [])
    for width in widths:
        height = round(image.height * width / image.width)
        resized = image.resize((width, height), Image.Resampling.LANCZOS) if width != image.width else image
        for fmt in formats:
            buffer = io.BytesIO()
            if fmt == "webp":
                resized.save(buffer, "WEBP", quality=82, method=5)
            else:
                resized.save(buffer, "AVIF", quality=58, speed=6)
            storage.put_bytes(asset.variant_key(width, fmt), buffer.getvalue(), f"image/{fmt}", storage.LONG_CACHE)

    tiny = image.copy()
    tiny.thumbnail((24, 24))
    buffer = io.BytesIO()
    tiny.save(buffer, "WEBP", quality=40)
    rgb = image.convert("RGB").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))

    asset.widths = widths
    asset.formats = formats
    asset.width, asset.height = image.width, image.height
    asset.blur_data_url = "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode()
    asset.dominant_color = "#{:02x}{:02x}{:02x}".format(*rgb[:3])
    asset.status = ImageAsset.Status.READY
    asset.error = ""
    asset.save()


def variant_for(asset_meta: dict, width: int, accept: str) -> str:
    widths = asset_meta["widths"] or [width]
    chosen = next((w for w in widths if w >= width), widths[-1])
    fmt = "avif" if "avif" in asset_meta["formats"] and "image/avif" in accept else "webp"
    return f"{asset_meta['key']}/w{chosen}.{fmt}"
