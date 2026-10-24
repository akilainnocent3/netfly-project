"""App Links (Android) and Universal Links (iOS): the association files that let
https://<site>/title/<slug> open the mobile app. The web app rewrites /.well-known/… here."""

from django.http import JsonResponse
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.core.config import config
from apps.core.throttling import throttle


def _listed(key: str) -> list[str]:
    return [v.strip() for v in config.get_str(key).split(",") if v.strip()]


def _cached(data) -> JsonResponse:
    response = JsonResponse(data, safe=False)
    response["Cache-Control"] = "public, max-age=3600"
    return response


class AssetLinksView(APIView):
    """`/.well-known/assetlinks.json`; 404 until the signing certificate is configured."""

    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_public")]

    @extend_schema(responses={200: dict}, operation_id="public_assetlinks")
    def get(self, request):
        fingerprints = [f.upper() for f in _listed("mobile.android_cert_sha256")]
        if not fingerprints:
            raise NotFound()
        return _cached(
            [
                {
                    "relation": ["delegate_permission/common.handle_all_urls"],
                    "target": {
                        "namespace": "android_app",
                        "package_name": config.get_str("mobile.android_package"),
                        "sha256_cert_fingerprints": fingerprints,
                    },
                }
            ]
        )


class AppleAppSiteAssociationView(APIView):
    """`/.well-known/apple-app-site-association`; 404 until the iOS app ID is configured."""

    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_public")]

    @extend_schema(responses={200: dict}, operation_id="public_apple_app_site_association")
    def get(self, request):
        app_ids = _listed("mobile.ios_app_ids")
        if not app_ids:
            raise NotFound()
        return _cached(
            {"applinks": {"details": [{"appIDs": app_ids, "components": [{"/": "/title/*"}]}]}}
        )
