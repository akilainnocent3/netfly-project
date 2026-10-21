from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_field,
    inline_serializer,
)
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
            "key",
            "label",
            "value_type",
            "value",
            "is_secret",
            "has_value",
            "is_public",
            "description",
            "unit",
            "validation",
            "requires_restart",
            "updated_by",
            "updated_at",
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
        fields = [
            "id",
            "actor",
            "action",
            "target_type",
            "target_id",
            "target_repr",
            "changes",
            "ip_address",
            "created_at",
        ]


class ConfigListView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(responses=ConfigGroupSerializer(many=True), operation_id="admin_config_list")
    def get(self, request):
        groups = ConfigGroup.objects.prefetch_related("entries__updated_by")
        return Response(ConfigGroupSerializer(groups, many=True).data)


class ConfigEntryView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(
        request=ConfigUpdateSerializer,
        responses=ConfigEntrySerializer,
        operation_id="admin_config_update",
    )
    def patch(self, request, key: str):
        data = ConfigUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not ConfigEntry.objects.filter(key=key).exists():
            raise APIError("Unknown setting.", "not_found", 404)
        try:
            config.set(key, data.validated_data["value"], actor=request.user, ip=client_ip(request))
        except ConfigValidationError as exc:
            raise APIError(str(exc), "validation_error", 400, {"value": str(exc)}) from exc
        return Response(
            ConfigEntrySerializer(
                ConfigEntry.objects.select_related("updated_by").get(key=key)
            ).data
        )


class IntroUploadView(APIView):
    """Replace the brand intro clip (validated MP4, stored content-addressed in the bucket)."""

    permission_classes = [SuperadminOnly]

    @extend_schema(
        request={
            "multipart/form-data": inline_serializer(
                "IntroUploadRequest",
                {
                    "file": serializers.FileField(),
                    "variant": serializers.ChoiceField(choices=["1080", "720"]),
                },
            )
        },
        responses=inline_serializer("IntroUploadResult", {"url": serializers.CharField()}),
        operation_id="admin_intro_upload",
    )
    def post(self, request):
        from apps.core.brand import store_intro

        upload = request.FILES.get("file")
        if upload is None:
            raise APIError("Choose an MP4 file.", "validation_error", fields={"file": "Required."})
        url = store_intro(
            upload,
            str(request.data.get("variant", "")),
            actor=request.user,
            ip=client_ip(request),
        )
        return Response({"url": url})


class ConfigHistoryView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(responses=AuditLogSerializer(many=True), operation_id="admin_config_history")
    def get(self, request, key: str):
        entry = ConfigEntry.objects.filter(key=key).first()
        if entry is None:
            raise APIError("Unknown setting.", "not_found", 404)
        logs = AuditLog.objects.filter(
            target_type="core.configentry", target_id=str(entry.pk)
        ).select_related("actor")[:50]
        return Response(AuditLogSerializer(logs, many=True).data)


TestResult = inline_serializer(
    "StorageTestResult",
    {
        "ok": serializers.BooleanField(),
        "message": serializers.CharField(),
        "steps": serializers.ListField(child=serializers.CharField(), required=False),
    },
)


class StorageTestView(APIView):
    """Verify S3 credentials *before* saving: unsaved form values override stored ones."""

    permission_classes = [SuperadminOnly]

    @extend_schema(
        request=inline_serializer(
            "StorageTestRequest",
            {
                k: serializers.CharField(required=False, allow_blank=True)
                for k in (
                    "bucket",
                    "region",
                    "access_key_id",
                    "secret_access_key",
                    "endpoint_url",
                    "prefix",
                )
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
        record(
            request.user,
            "storage.apply_cors",
            None,
            target_type="storage",
            changes={"origins": origins},
            ip=client_ip(request),
        )
        return Response(
            {"ok": True, "message": f"CORS allows {', '.join(origins) or 'all origins'}."}
        )


class CdnTestView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(
        request=inline_serializer(
            "CdnTestRequest",
            {
                "domain": serializers.CharField(required=False),
                "key_pair_id": serializers.CharField(required=False),
                "private_key": serializers.CharField(required=False),
            },
        ),
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
        if not url.startswith("https://"):
            return Response({"ok": False, "message": "The CDN domain must use HTTPS."})
        try:
            request_ = urllib.request.Request(
                url, method="GET"
            )  # noqa: S310 - https enforced above
            with urllib.request.urlopen(request_, timeout=8) as response:  # noqa: S310
                ok = response.status == 200
            return Response(
                {
                    "ok": ok,
                    "message": (
                        "CDN served the test object." if ok else f"CDN returned {response.status}."
                    ),
                }
            )
        except urllib.error.HTTPError as exc:
            return Response(
                {
                    "ok": False,
                    "message": f"CDN returned {exc.code}. Check the origin and signing key.",
                }
            )
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

    def rsa_signer(message: bytes) -> bytes:
        return private_key.sign(
            message, padding.PKCS1v15(), hashes.SHA1()
        )  # noqa: S303 - CloudFront requires SHA1

    signer = CloudFrontSigner(key_id, rsa_signer)
    return signer.generate_presigned_url(
        url, date_less_than=dt.datetime.now(dt.UTC) + dt.timedelta(minutes=5)
    )


class LegalPageAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = LegalPage
        fields = ["slug", "title", "body_markdown", "updated_at"]
        read_only_fields = ["slug", "updated_at"]


class LegalPagesView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(responses=LegalPageAdminSerializer(many=True), operation_id="admin_legal_list")
    def get(self, request):
        return Response(
            LegalPageAdminSerializer(LegalPage.objects.order_by("slug"), many=True).data
        )


class LegalPageView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(
        request=LegalPageAdminSerializer,
        responses=LegalPageAdminSerializer,
        operation_id="admin_legal_update",
    )
    def patch(self, request, slug: str):
        page = LegalPage.objects.filter(slug=slug).first()
        if page is None:
            raise APIError("Page not found.", "not_found", 404)
        data = LegalPageAdminSerializer(page, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        before = page.body_markdown
        data.save(updated_by=request.user)
        record(
            request.user,
            "legal.update",
            page,
            changes={"changed": before != page.body_markdown},
            ip=client_ip(request),
        )
        return Response(data.data)


# -- messaging: test buttons and the test-mode outbox ------------------------------------------
class EmailTestView(APIView):
    """Settings → Email → Send test email (uses the saved SMTP settings)."""

    permission_classes = [SuperadminOnly]

    @extend_schema(
        request=inline_serializer("EmailTestRequest", {"to": serializers.EmailField()}),
        responses=TestResult,
        operation_id="admin_email_test",
    )
    def post(self, request):
        from apps.messaging import email as mail
        from apps.messaging.errors import MessagingError

        to = serializers.EmailField().run_validation(request.data.get("to"))
        site = config.get_str("branding.site_name", "NETFLY")
        try:
            mail.send(
                to,
                f"{site} test email",
                f"This is a test email from {site}. Your SMTP settings work.",
            )
        except MessagingError as exc:
            return Response({"ok": False, "message": exc.message})
        record(request.user, "email.test", None, target_type="email", ip=client_ip(request))
        return Response({"ok": True, "message": f"Sent a test email to {to}."})


class SmsTestView(APIView):
    """Settings → SMS → Send test SMS."""

    permission_classes = [SuperadminOnly]

    @extend_schema(
        request=inline_serializer("SmsTestRequest", {"to": serializers.CharField()}),
        responses=TestResult,
        operation_id="admin_sms_test",
    )
    def post(self, request):
        from apps.accounts import phone as phones
        from apps.messaging import sms
        from apps.messaging.errors import MessagingError

        try:
            to = phones.normalize(str(request.data.get("to") or ""))
        except ValueError as exc:
            return Response({"ok": False, "message": str(exc)})
        site = config.get_str("branding.site_name", "NETFLY")
        try:
            ref = sms.send(to, f"This is a test SMS from {site}. Your SMS settings work.")
        except MessagingError as exc:
            return Response({"ok": False, "message": exc.message})
        record(request.user, "sms.test", None, target_type="sms", ip=client_ip(request))
        return Response(
            {"ok": True, "message": f"Sent to {phones.masked(to)} (Beem request {ref})."}
        )


class SmsBalanceView(APIView):
    permission_classes = [SuperadminOnly]

    @extend_schema(responses=TestResult, operation_id="admin_sms_balance")
    def get(self, request):
        from apps.messaging import sms
        from apps.messaging.errors import MessagingError

        try:
            credit = sms.balance()
        except MessagingError as exc:
            return Response({"ok": False, "message": exc.message})
        return Response({"ok": True, "message": f"Beem balance: {credit:,.0f} SMS credits."})


OutboxMessage = inline_serializer(
    "OutboxMessage",
    {
        "ref": serializers.CharField(),
        "at": serializers.FloatField(),
        "subject": serializers.CharField(),
        "body": serializers.CharField(),
    },
    many=True,
)


class OutboxView(APIView):
    """Test mode only: what would have been sent to an address / number (newest first)."""

    permission_classes = [SuperadminOnly]

    @extend_schema(
        parameters=[
            OpenApiParameter("kind", str, enum=["email", "sms"]),
            OpenApiParameter("to", str),
        ],
        responses=OutboxMessage,
        operation_id="admin_outbox",
    )
    def get(self, request):
        from apps.messaging import outbox

        if not outbox.enabled():
            raise APIError("Test mode is off.", "not_found", 404)
        kind = request.query_params.get("kind", "")
        to = request.query_params.get("to", "")
        if kind not in ("email", "sms") or not to:
            raise APIError("Choose kind and to.", "validation_error")
        if kind == "sms":
            from apps.accounts import phone as phones

            try:
                to = phones.normalize(to)
            except ValueError as exc:
                raise APIError(str(exc), "validation_error") from exc
        response = Response(outbox.read(kind, to))
        response["Cache-Control"] = "no-store"
        return response
