from django.core.cache import cache
from django.http import HttpResponseRedirect, JsonResponse
from django.utils.cache import patch_cache_control, patch_vary_headers
from django.views import View

from apps.core import storage
from apps.core.config import config

from .images import variant_for
from .models import ImageAsset


def image_meta(asset_id: str) -> dict | None:
    """Widths/formats of a rendered image, cached. Older versions in stale pages get the current render."""
    key = f"img:{asset_id}"
    meta = cache.get(key)
    if meta is None:
        asset = ImageAsset.objects.filter(pk=asset_id, status=ImageAsset.Status.READY).only(
            "id", "version", "widths", "formats"
        ).first()
        if asset is None:
            return None
        meta = {"key": asset.key, "version": asset.version, "widths": asset.widths, "formats": asset.formats}
        cache.set(key, meta, 86400)
    return meta


class ImageRedirectView(View):
    """`/api/v1/img/images/<id>/v<n>/w<width>` → 302 to a signed S3/CDN URL (cached).

    A plain Django view: browsers send image Accept headers DRF can't negotiate."""

    def get(self, request, asset_id, version: int, width: int):
        meta = image_meta(str(asset_id))
        if meta is None:
            return JsonResponse({"code": "not_found", "message": "Image not found."}, status=404)
        key = variant_for(meta, width, request.META.get("HTTP_ACCEPT", ""))
        ttl = config.get_int("storage.image_url_ttl_seconds", 604800)
        response = HttpResponseRedirect(storage.presign_get(key, ttl))
        # URLs are time-bucketed (stable for ttl/4), so the redirect can be cached for a while.
        patch_cache_control(response, public=True, max_age=max(60, ttl // 8))
        patch_vary_headers(response, ("Accept",))
        return response
