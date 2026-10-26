from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Title

from .models import ApprovedEmbed, DiscoveredLink, ExtractionJob

# ---- typed shape of DiscoveredLink.check_result (documentation for the generated client) ----


class CheckVerdictSerializer(serializers.Serializer):
    verdict = serializers.ChoiceField(choices=["yes", "no", "unknown"])
    reasons = serializers.ListField(child=serializers.CharField())


class PageEmbedVerdictSerializer(CheckVerdictSerializer):
    notes = serializers.ListField(child=serializers.CharField(), required=False)


class EmbedCodeSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=ApprovedEmbed.EmbedType.choices)
    src = serializers.CharField()
    html = serializers.CharField(required=False)


class StreamRenditionSerializer(serializers.Serializer):
    bandwidth = serializers.IntegerField()
    width = serializers.IntegerField(allow_null=True)
    height = serializers.IntegerField(allow_null=True)
    codecs = serializers.CharField()


class CheckedVideoSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["file", "hls", "dash", "provider_embed"])
    url = serializers.CharField()
    provider = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField(required=False)
    thumbnail = serializers.CharField()
    thumbnail_data = serializers.CharField(
        required=False, help_text="Small JPEG data: URI of the thumbnail, fetched by the server."
    )
    duration = serializers.FloatField(allow_null=True)
    width = serializers.IntegerField(allow_null=True)
    height = serializers.IntegerField(allow_null=True)
    playable_in_netfly = CheckVerdictSerializer()
    embed = EmbedCodeSerializer(allow_null=True)
    origins = serializers.ListField(child=serializers.CharField())
    renditions = StreamRenditionSerializer(many=True, required=False)
    cors = serializers.BooleanField(required=False)
    accept_ranges = serializers.BooleanField(required=False)
    drm = serializers.BooleanField(required=False)
    size = serializers.IntegerField(required=False, allow_null=True)


class CheckRedirectSerializer(serializers.Serializer):
    url = serializers.CharField()
    status = serializers.IntegerField()


class CheckResultSerializer(serializers.Serializer):
    reachable = serializers.BooleanField()
    final_url = serializers.CharField()
    http_status = serializers.IntegerField(allow_null=True)
    content_type = serializers.CharField()
    redirects = CheckRedirectSerializer(many=True)
    link_kind = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    thumbnail = serializers.CharField()
    thumbnail_data = serializers.CharField(required=False)
    page_embeddable = PageEmbedVerdictSerializer()
    videos = CheckedVideoSerializer(many=True)
    recommended = serializers.JSONField(
        allow_null=True, help_text='Index into `videos`, "page", or null when nothing plays.'
    )
    client_origins = serializers.ListField(child=serializers.CharField())
    checked_at = serializers.CharField()
    error = serializers.CharField(required=False)


# ---- jobs ------------------------------------------------------------------------------------


class ExtractionJobOptionsSerializer(serializers.Serializer):
    max_pages = serializers.IntegerField(min_value=1, max_value=50000, required=False)
    max_depth = serializers.IntegerField(min_value=0, max_value=20, required=False)
    same_domain_only = serializers.BooleanField(required=False)
    same_host_only = serializers.BooleanField(required=False)
    render_js = serializers.BooleanField(required=False)
    respect_robots = serializers.BooleanField(required=False)


class ExtractionJobCreateSerializer(serializers.Serializer):
    url = serializers.CharField(max_length=2048)
    options = ExtractionJobOptionsSerializer(required=False)


class ExtractionJobSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    options = ExtractionJobOptionsSerializer(read_only=True)
    notes = serializers.ListField(child=serializers.CharField(), read_only=True)

    class Meta:
        model = ExtractionJob
        fields = [
            "id",
            "start_url",
            "normalized_origin",
            "status",
            "progress",
            "pages_crawled",
            "links_found",
            "current_url",
            "options",
            "notes",
            "error",
            "created_by_name",
            "created_at",
            "started_at",
            "finished_at",
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj) -> str:
        user = obj.created_by
        return (user.full_name or user.username) if user else ""


class ExtractionLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoveredLink
        fields = [
            "id",
            "job",
            "url",
            "kind",
            "source",
            "found_on",
            "depth",
            "http_status",
            "content_type",
            "title",
            "is_internal",
            "error",
            "has_video",
            "check_status",
            "checked_at",
        ]
        read_only_fields = fields


class LinkKindCountsSerializer(serializers.Serializer):
    page = serializers.IntegerField()
    video_file = serializers.IntegerField()
    stream = serializers.IntegerField()
    embed = serializers.IntegerField()
    image = serializers.IntegerField()
    document = serializers.IntegerField()
    other = serializers.IntegerField()


class ExtractionJobDetailSerializer(ExtractionJobSerializer):
    kind_counts = serializers.SerializerMethodField()
    video_links = serializers.SerializerMethodField()

    class Meta(ExtractionJobSerializer.Meta):
        fields = [*ExtractionJobSerializer.Meta.fields, "kind_counts", "video_links"]
        read_only_fields = fields

    @extend_schema_field(LinkKindCountsSerializer)
    def get_kind_counts(self, obj) -> dict:
        from django.db.models import Count

        counts = dict(obj.links.values_list("kind").annotate(n=Count("id")).order_by())
        return {kind: counts.get(kind, 0) for kind, _ in DiscoveredLink.Kind.choices}

    @extend_schema_field(ExtractionLinkSerializer(many=True))
    def get_video_links(self, obj) -> list:
        """Videos and embeds the crawl found: Studio lists them first."""
        links = obj.links.filter(has_video=True).order_by("depth", "id")[:24]
        return ExtractionLinkSerializer(links, many=True).data


class ExtractionLinkDetailSerializer(ExtractionLinkSerializer):
    check_result = serializers.SerializerMethodField()

    class Meta(ExtractionLinkSerializer.Meta):
        fields = [*ExtractionLinkSerializer.Meta.fields, "check_result"]
        read_only_fields = fields

    @extend_schema_field(CheckResultSerializer(allow_null=True))
    def get_check_result(self, obj):
        return obj.check_result


class LinkCheckRequestSerializer(serializers.Serializer):
    force = serializers.BooleanField(required=False, default=False)


# ---- approval --------------------------------------------------------------------------------


@extend_schema_field(
    {
        "oneOf": [{"type": "integer", "minimum": 0}, {"type": "string", "enum": ["page"]}],
        "description": 'Index into check_result.videos, or "page" to embed the page itself.',
    }
)
class VideoChoiceField(serializers.Field):
    default_error_messages = {"invalid": 'Choose a video (its index) or "page".'}

    def to_internal_value(self, data):
        if data == "page":
            return "page"
        if isinstance(data, bool):
            self.fail("invalid")
        try:
            value = int(data)
        except (TypeError, ValueError):
            self.fail("invalid")
        if value < 0:
            self.fail("invalid")
        return value

    def to_representation(self, value):
        return value


class EmbedTitleRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Title
        fields = ["id", "title", "slug", "year", "type"]
        read_only_fields = fields


class _EmbedWriteMixin:
    def validate_netfly_title_id(self, value):
        if value is not None and not Title.objects.filter(pk=value).exists():
            raise serializers.ValidationError("That NETFLY title doesn't exist.")
        return value


class EmbedApproveSerializer(_EmbedWriteMixin, serializers.Serializer):
    video_index = VideoChoiceField()
    title = serializers.CharField(max_length=300, trim_whitespace=True)
    description = serializers.CharField(max_length=5000, trim_whitespace=True)
    netfly_title_id = serializers.IntegerField(required=False, allow_null=True)
    rights_confirmed = serializers.BooleanField()
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError("Write the title viewers will see.")
        return value

    def validate_description(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError(
                "Write a description viewers will see (at least 10 characters)."
            )
        return value

    def validate_rights_confirmed(self, value):
        if value is not True:
            raise serializers.ValidationError(
                "Confirm that NETFLY has the rights to show this video, or that its owner permits embedding."
            )
        return value


class EmbedUpdateSerializer(_EmbedWriteMixin, serializers.Serializer):
    title = serializers.CharField(max_length=300, required=False)
    description = serializers.CharField(max_length=5000, required=False)
    netfly_title_id = serializers.IntegerField(required=False, allow_null=True)
    rights_note = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    def validate_title(self, value):
        if not value.strip():
            raise serializers.ValidationError("The title can't be empty.")
        return value.strip()

    def validate_description(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError("Write a description (at least 10 characters).")
        return value.strip()


class ApprovedEmbedSerializer(serializers.ModelSerializer):
    netfly_title = EmbedTitleRefSerializer(read_only=True)
    approved_by_name = serializers.SerializerMethodField()
    revoked_by_name = serializers.SerializerMethodField()
    job_id = serializers.SerializerMethodField()

    class Meta:
        model = ApprovedEmbed
        fields = [
            "id",
            "link",
            "job_id",
            "original_url",
            "page_url",
            "embed_type",
            "embed_url",
            "embed_html",
            "provider",
            "title",
            "description",
            "thumbnail_url",
            "thumbnail_data",
            "duration",
            "width",
            "height",
            "netfly_title",
            "status",
            "rights_confirmed",
            "rights_note",
            "approved_by_name",
            "approved_at",
            "revoked_by_name",
            "revoked_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_approved_by_name(self, obj) -> str:
        user = obj.approved_by
        return (user.full_name or user.username) if user else ""

    def get_revoked_by_name(self, obj) -> str:
        user = obj.revoked_by
        return (user.full_name or user.username) if user else ""

    def get_job_id(self, obj) -> str | None:
        return str(obj.link.job_id) if obj.link_id and obj.link else None


# ---- preview ---------------------------------------------------------------------------------


class ExtractionPreviewTokenSerializer(serializers.Serializer):
    token = serializers.CharField()
    expires_in = serializers.IntegerField()


class ExtractionPreviewOriginsSerializer(serializers.Serializer):
    frame = serializers.ListField(child=serializers.CharField())
    media = serializers.ListField(child=serializers.CharField())
    connect = serializers.ListField(child=serializers.CharField())


class ExtractionPreviewSerializer(serializers.Serializer):
    title = serializers.CharField()
    embed = EmbedCodeSerializer()
    origins = ExtractionPreviewOriginsSerializer()
    verdict = serializers.ChoiceField(choices=["yes", "no", "unknown"])
    reasons = serializers.ListField(child=serializers.CharField())


class ExtractionCapabilitiesSerializer(serializers.Serializer):
    worker = serializers.BooleanField()
    render_js = serializers.BooleanField()
    render_js_reason = serializers.CharField()
    ffprobe = serializers.BooleanField()
    max_pages = serializers.IntegerField()
    max_depth = serializers.IntegerField()
    max_links = serializers.IntegerField()
    respect_robots = serializers.BooleanField()
    max_concurrent_jobs = serializers.IntegerField()
