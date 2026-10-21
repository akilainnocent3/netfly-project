import re

from django.core.cache import cache
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.utils.cache import patch_cache_control, patch_vary_headers
from django.views import View

from apps.core import storage
from apps.core.config import config

from . import delivery
from .images import variant_for
from .models import ImageAsset, VideoAsset


def image_meta(asset_id: str) -> dict | None:
    """Widths/formats of a rendered image, cached. Older versions in stale pages get the current render."""
    key = f"img:{asset_id}"
    meta = cache.get(key)
    if meta is None:
        asset = (
            ImageAsset.objects.filter(pk=asset_id, status=ImageAsset.Status.READY)
            .only("id", "version", "widths", "formats")
            .first()
        )
        if asset is None:
            return None
        meta = {
            "key": asset.key,
            "version": asset.version,
            "widths": asset.widths,
            "formats": asset.formats,
        }
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


# -- HLS delivery ---------------------------------------------------------------
STREAM_NAME = re.compile(r"^(master|v\d+|a\d+|s\d+)$")


def _allowance_left(user_id: int) -> bool:
    from apps.accounts.models import User
    from apps.billing import usage

    user = User.objects.filter(pk=user_id, is_active=True).first()
    return user is not None and usage.snapshot(user)["allowed"]


class StreamView(View):
    """Token-checked playlists: master, renditions (v#), audio (a#), subtitles (s#)."""

    def get(self, request, asset_id, name: str):
        token = request.GET.get("t", "")
        claims = delivery.token_claims(token, str(asset_id)) if STREAM_NAME.match(name) else None
        if claims is None:
            return JsonResponse(
                {"code": "forbidden", "message": "This playback link has expired."}, status=403
            )
        if claims.get("s") and name[0] in "mva" and not _allowance_left(claims["u"]):
            # A metered session stops loading once the viewing allowance is spent, even for a
            # client that ignores the heartbeat's "stop".
            return JsonResponse(
                {"code": "usage_limit_reached", "message": "You've reached your viewing limit."},
                status=403,
            )
        asset = VideoAsset.objects.filter(pk=asset_id, status=VideoAsset.Status.READY).first()
        if asset is None:
            return JsonResponse(
                {"code": "not_found", "message": "Video not available."}, status=404
            )
        try:
            if name == "master":
                max_h = request.GET.get("max_height")
                asked = int(max_h) if max_h and max_h.isdigit() else None
                # A preview token keeps its cap whatever the URL says.
                cap = claims.get("h")
                body = delivery.master_playlist(
                    asset, token, max_height=min(filter(None, [asked, cap]), default=None)
                )
            elif name[0] == "v":
                body = delivery.media_playlist(asset, asset.renditions[int(name[1:])]["playlist"])
            elif name[0] == "a":
                body = delivery.media_playlist(asset, asset.audio_tracks[int(name[1:])]["playlist"])
            else:
                sub = asset.subtitles.filter(pk=int(name[1:])).first()
                if sub is None:
                    return JsonResponse(
                        {"code": "not_found", "message": "Subtitle not found."}, status=404
                    )
                body = delivery.subtitle_playlist(asset, sub)
        except IndexError:
            return JsonResponse(
                {"code": "not_found", "message": "Rendition not found."}, status=404
            )
        response = HttpResponse(body, content_type="application/vnd.apple.mpegurl")
        response["Cache-Control"] = "private, max-age=60"
        return response


class ThumbnailsView(View):
    def get(self, request, asset_id):
        if delivery.check_token(request.GET.get("t", ""), str(asset_id)) is None:
            return JsonResponse({"code": "forbidden", "message": "Expired."}, status=403)
        asset = VideoAsset.objects.filter(pk=asset_id, status=VideoAsset.Status.READY).first()
        if asset is None:
            return JsonResponse(
                {"code": "not_found", "message": "Video not available."}, status=404
            )
        response = HttpResponse(
            delivery.thumbnails_vtt(asset), content_type="text/vtt; charset=utf-8"
        )
        response["Cache-Control"] = "private, max-age=300"
        return response
