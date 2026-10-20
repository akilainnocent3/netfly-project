from drf_spectacular.utils import extend_schema, extend_schema_field, inline_serializer
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import SuperadminOnly
from apps.core import storage
from apps.core.audit import client_ip, record
from apps.core.config import ConfigValidationError, config
from apps.core.exceptions import APIError
from apps.core.models import AuditLog, ConfigEntry, ConfigGroup, LegalPage


class ConfigEntrySerializer(serializers.ModelSerializer):
    value = serializers.SerializerMethodField()
    has_value = serializers.BooleanField(read_only=True)
    updated_by = serializers.CharField(source="updated_by.username", default=None, read_only=True)

    class Meta:
        model = ConfigEntry
        fields = [
            "key", "label", "value_type", "value", "is_secret", "has_value", "is_public", "description", "unit",
            "validation", "requires_restart", "updated_by", "updated_at",
        ]

    @extend_schema_field(serializers.JSONField(allow_null=True))
    def get_value(self, obj):
        # Secrets are write-only: never returned, not even masked server-side.
        return None if obj.is_secret else obj.value


class ConfigGroupSerializer(serializers.ModelSerializer):
    entries = ConfigEntrySerializer(many=True, read_only=True)

    class Meta:
        model = ConfigGroup
        fields = ["key", "name", "description", "entries"]


class ConfigUpdateSerializer(serializers.Serializer):
    value = serializers.JSONField(allow_null=True)


class AuditLogSerializer(serializers.ModelSerializer):
    actor = serializers.CharField(source="actor.username", default=None, read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "actor", "action", "target_type", "target_id", "target_repr", "changes", "ip_address", "created_at"]


class ConfigListView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(responses=ConfigGroupSerializer(many=True), operation_id="admin_config_list")
    def get(self, request):
        groups = ConfigGroup.objects.prefetch_related("entries__updated_by")
        return Response(ConfigGroupSerializer(groups, many=True).data)


class ConfigEntryView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(request=ConfigUpdateSerializer, responses=ConfigEntrySerializer, operation_id="admin_config_update")
    def patch(self, request, key: str):
        data = ConfigUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not ConfigEntry.objects.filter(key=key).exists():
            raise APIError("Unknown setting.", "not_found", 404)
        try:
            config.set(key, data.validated_data["value"], actor=request.user, ip=client_ip(request))
        except ConfigValidationError as exc:
            raise APIError(str(exc), "validation_error", 400, {"value": str(exc)}) from exc
        return Response(ConfigEntrySerializer(ConfigEntry.objects.select_related("updated_by").get(key=key)).data)


class ConfigHistoryView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(responses=AuditLogSerializer(many=True), operation_id="admin_config_history")
    def get(self, request, key: str):
        entry = ConfigEntry.objects.filter(key=key).first()
        if entry is None:
            raise APIError("Unknown setting.", "not_found", 404)
        logs = AuditLog.objects.filter(target_type="core.configentry", target_id=str(entry.pk)).select_related("actor")[:50]
        return Response(AuditLogSerializer(logs, many=True).data)


TestResult = inline_serializer(
    "StorageTestResult",
    {"ok": serializers.BooleanField(), "message": serializers.CharField(), "steps": serializers.ListField(child=serializers.CharField(), required=False)},
)


class StorageTestView(APIView):
    """Verify S3 credentials *before* saving: unsaved form values override stored ones."""

    permission_classes = [SuperadminOnly]

    @extend_schema(
        request=inline_serializer(
            "StorageTestRequest",
            {
                k: serializers.CharField(required=False, allow_blank=True)
                for k in ("bucket", "region", "access_key_id", "secret_access_key", "endpoint_url", "prefix")
            },
        ),
        responses=TestResult,
        operation_id="admin_storage_test",
    )
    def post(self, request):
        overrides = {k: str(v) for k, v in request.data.items() if isinstance(v, str) and v != ""}
        return Response(storage.test_connection(overrides))


class StorageCorsView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(request=None, responses=TestResult, operation_id="admin_storage_apply_cors")
    def post(self, request):
        origins = sorted(set(config.get_json("security.cors_allowed_origins") or []))
        try:
            storage.apply_bucket_cors(origins or None)
        except Exception as exc:  # noqa: BLE001 - surface the S3 error to the operator
            return Response({"ok": False, "message": f"Couldn't update CORS: {exc}"})
        record(request.user, "storage.apply_cors", None, target_type="storage", changes={"origins": origins}, ip=client_ip(request))
        return Response({"ok": True, "message": f"CORS allows {', '.join(origins) or 'all origins'}."})


class CdnTestView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(
        request=inline_serializer("CdnTestRequest", {"domain": serializers.CharField(required=False), "key_pair_id": serializers.CharField(required=False), "private_key": serializers.CharField(required=False)}),
        responses=TestResult,
        operation_id="admin_cdn_test",
    )
    def post(self, request):
        import urllib.error
        import urllib.request

        domain = request.data.get("domain") or config.get_str("storage.cdn.domain")
        if not domain:
            return Response({"ok": False, "message": "Set the CDN domain first."})
        probe_key = storage.full_key(".netfly-connection-test")
        try:
            storage.put_bytes(".netfly-connection-test", b"ok", "text/plain", storage.SHORT_CACHE)
        except Exception as exc:  # noqa: BLE001
            return Response({"ok": False, "message": f"S3 isn't reachable: {exc}"})
        key_id = request.data.get("key_pair_id") or config.get_str("storage.cdn.key_pair_id")
        pem = request.data.get("private_key") or config.get_secret("storage.cdn.private_key")
        url = _cdn_url(domain, probe_key, key_id, pem)
        try:
            with urllib.request.urlopen(url, timeout=8) as response:  # noqa: S310 - operator-provided https URL
                ok = response.status == 200
            return Response({"ok": ok, "message": "CDN served the test object." if ok else f"CDN returned {response.status}."})
        except urllib.error.HTTPError as exc:
            return Response({"ok": False, "message": f"CDN returned {exc.code}. Check the origin and signing key."})
        except (urllib.error.URLError, TimeoutError) as exc:
            return Response({"ok": False, "message": f"Couldn't reach the CDN: {exc}"})


def _cdn_url(domain: str, key: str, key_id: str, pem: str) -> str:
    import datetime as dt
    from urllib.parse import quote

    from botocore.signers import CloudFrontSigner
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    base = domain if domain.startswith("http") else f"https://{domain}"
    url = f"{base.rstrip('/')}/{quote(key, safe='/~')}"
    if not (key_id and pem):
        return url
    private_key = serialization.load_pem_private_key(pem.encode(), password=None)
    signer = CloudFrontSigner(key_id, lambda m: private_key.sign(m, padding.PKCS1v15(), hashes.SHA1()))  # noqa: S303
    return signer.generate_presigned_url(url, date_less_than=dt.datetime.now(dt.UTC) + dt.timedelta(minutes=5))


class LegalPageAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = LegalPage
        fields = ["slug", "title", "body_markdown", "updated_at"]
        read_only_fields = ["slug", "updated_at"]


class LegalPagesView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(responses=LegalPageAdminSerializer(many=True), operation_id="admin_legal_list")
    def get(self, request):
        return Response(LegalPageAdminSerializer(LegalPage.objects.order_by("slug"), many=True).data)


class LegalPageView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(request=LegalPageAdminSerializer, responses=LegalPageAdminSerializer, operation_id="admin_legal_update")
    def patch(self, request, slug: str):
        page = LegalPage.objects.filter(slug=slug).first()
        if page is None:
            raise APIError("Page not found.", "not_found", 404)
        data = LegalPageAdminSerializer(page, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        before = page.body_markdown
        data.save(updated_by=request.user)
        record(request.user, "legal.update", page, changes={"changed": before != page.body_markdown}, ip=client_ip(request))
        return Response(data.data)

