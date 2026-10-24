import re

from django.db import connection
from django.utils.cache import patch_cache_control
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .config import config
from .models import LegalPage


def media_origins() -> list[str]:
    """Origins the browser loads media from (for the frontends' CSP). Not secret."""
    from urllib.parse import urlsplit

    from .storage import _public_base, s3_settings

    origins: list[str] = []
    s = s3_settings()
    if s.bucket:
        parts = urlsplit(_public_base(s))
        origins.append(f"{parts.scheme}://{parts.netloc}")
    domain = config.get_str("storage.cdn.domain")
    if config.get_bool("storage.cdn.enabled") and domain:
        origins.append(domain if domain.startswith("http") else f"https://{domain}")
    # An operator may point the intro at an external https URL: the CSP must allow it.
    for key in ("intro.video_url_1080", "intro.video_url_720"):
        url = config.get_str(key)
        if url.startswith("https://"):
            parts = urlsplit(url)
            origin = f"https://{parts.netloc}"
            if re.fullmatch(r"[A-Za-z0-9.-]+(:\d{1,5})?", parts.netloc) and origin not in origins:
                origins.append(origin)
    return origins


class HealthView(APIView):
    authentication_classes: list = []

    @extend_schema(
        responses=inline_serializer("Health", {"ok": serializers.BooleanField()}),
        operation_id="health",
    )
    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return Response({"ok": True})


class PublicConfigView(APIView):
    """Branding, feature flags and player defaults (`is_public` entries only)."""

    authentication_classes: list = []

    @extend_schema(
        responses=inline_serializer(
            "PublicConfig", {"values": serializers.DictField(child=serializers.JSONField())}
        ),
        operation_id="public_config",
    )
    def get(self, request):
        from apps.media.data_usage import public_values

        values = config.public()
        values["media_origins"] = media_origins()
        values.update(public_values())  # derived from the ladder: the autoplay data warnings
        response = Response({"values": values})
        patch_cache_control(response, public=True, max_age=15, stale_while_revalidate=60)
        return response


class LegalPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = LegalPage
        fields = ["slug", "title", "body_markdown", "updated_at"]


class LegalPageView(APIView):
    authentication_classes: list = []

    @extend_schema(responses=LegalPageSerializer, operation_id="legal_page")
    def get(self, request, slug: str):
        page = LegalPage.objects.filter(slug=slug).first()
        if page is None:
            from rest_framework.exceptions import NotFound

            raise NotFound("Page not found.")
        response = Response(LegalPageSerializer(page).data)
        patch_cache_control(response, public=True, max_age=300)
        return response
