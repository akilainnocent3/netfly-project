from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_field,
    inline_serializer,
)
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.catalog.models import Episode, Title
from apps.core import storage
from apps.core.config import config
from apps.core.exceptions import APIError
from apps.core.throttling import throttle
from apps.media import delivery, uploads
from apps.media.models import SubtitleTrack, UploadSession, VideoAsset
from apps.media.serializers import AdminVideoSerializer, SubtitleSerializer
from apps.media.tasks import queue_transcode

from .mixins import AdminPagination, AuditedMixin


class UploadStartSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    size = serializers.IntegerField(min_value=1)
    content_type = serializers.CharField(max_length=100, allow_blank=True)
    kind = serializers.ChoiceField(choices=VideoAsset.Kind.choices, default=VideoAsset.Kind.FEATURE)
    fingerprint = serializers.CharField(max_length=255)


class PartSerializer(serializers.Serializer):
    number = serializers.IntegerField(min_value=1)
    etag = serializers.CharField()
    size = serializers.IntegerField(required=False)


class UploadSessionSerializer(serializers.ModelSerializer):
    asset_id = serializers.UUIDField(read_only=True)
    completed_parts = serializers.SerializerMethodField()

    class Meta:
        model = UploadSession
        fields = [
            "id",
            "asset_id",
            "filename",
            "size",
            "part_size",
            "part_count",
            "status",
            "completed_parts",
            "created_at",
        ]

    @extend_schema_field(PartSerializer(many=True))
    def get_completed_parts(self, obj):
        return self.context.get("parts", [])


class SignPartsSerializer(serializers.Serializer):
    numbers = serializers.ListField(
        child=serializers.IntegerField(min_value=1), min_length=1, max_length=100
    )


class CompleteSerializer(serializers.Serializer):
    parts = PartSerializer(many=True)


class SignedPartSerializer(serializers.Serializer):
    number = serializers.IntegerField()
    url = serializers.URLField()


class UploadViewSet(AuditedMixin, viewsets.GenericViewSet):
    audit_type = "upload"
    queryset = UploadSession.objects.select_related("asset")
    serializer_class = UploadSessionSerializer
    throttle_classes = [throttle("security.rate_upload", per_user=True)]

    @extend_schema(request=UploadStartSerializer, responses={201: UploadSessionSerializer})
    def create(self, request):
        data = UploadStartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        session, parts = uploads.start(user=request.user, **data.validated_data)
        if not parts:
            self._audit(
                "start", session.asset, {"filename": session.filename, "size": session.size}
            )
        return Response(
            UploadSessionSerializer(session, context={"parts": parts}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=SignPartsSerializer, responses=SignedPartSerializer(many=True))
    @action(detail=True, methods=["post"])
    def sign(self, request, pk=None):
        data = SignPartsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(uploads.sign_parts(self.get_object(), data.validated_data["numbers"]))

    @extend_schema(request=CompleteSerializer, responses=AdminVideoSerializer)
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        data = CompleteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        session = self.get_object()
        asset = uploads.complete(session, data.validated_data["parts"])
        self._audit("complete", asset, {"filename": session.filename})
        return Response(AdminVideoSerializer(asset).data)

    @extend_schema(responses={204: None})
    def destroy(self, request, pk=None):
        session = self.get_object()
        uploads.abort(session)
        self._audit("abort", session, {"filename": session.filename})
        return Response(status=204)


class VideoJobSerializer(AdminVideoSerializer):
    usage = serializers.SerializerMethodField()

    class Meta(AdminVideoSerializer.Meta):
        fields = [*AdminVideoSerializer.Meta.fields, "usage"]
        read_only_fields = fields

    def get_usage(self, obj) -> list[str]:
        out = (
            [f"{t.title}{' (trailer)' if t.trailer_id == obj.pk else ''}" for t in obj._titles]
            if hasattr(obj, "_titles")
            else []
        )
        out += [
            f"{e.season.title.title} S{e.season.number}:E{e.number}"
            for e in getattr(obj, "_episodes", [])
        ]
        return out


class PreviewSerializer(serializers.Serializer):
    master_url = serializers.CharField()
    thumbnails_url = serializers.CharField()
    duration = serializers.FloatField()


class SubtitleUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    language = serializers.RegexField(r"^[a-z]{2,3}(-[A-Za-z]{2,4})?$")
    label = serializers.CharField(max_length=60)
    is_default = serializers.BooleanField(default=False)
    is_forced = serializers.BooleanField(default=False)


class VideoViewSet(
    AuditedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    audit_type = "video"
    serializer_class = VideoJobSerializer
    pagination_class = AdminPagination
    parser_classes = [JSONParser, MultiPartParser]

    def get_queryset(self):
        qs = VideoAsset.objects.prefetch_related("subtitles")
        if status_filter := self.request.query_params.get("status"):
            qs = qs.filter(status__in=status_filter.split(","))
        return qs.order_by("-created_at")

    def _attach_usage(self, assets):
        ids = [a.pk for a in assets]
        titles = list(
            Title.objects.filter(Q(video_id__in=ids) | Q(trailer_id__in=ids)).only(
                "title", "video_id", "trailer_id"
            )
        )
        episodes = list(
            Episode.objects.filter(video_id__in=ids)
            .select_related("season__title")
            .only("number", "video_id", "season__number", "season__title__title")
        )
        for a in assets:
            a._titles = [t for t in titles if a.pk in (t.video_id, t.trailer_id)]
            a._episodes = [e for e in episodes if e.video_id == a.pk]
        return assets

    @extend_schema(
        parameters=[OpenApiParameter("status", str, description="Comma-separated statuses")]
    )
    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(
            self.get_serializer(self._attach_usage(page), many=True).data
        )

    def retrieve(self, request, *args, **kwargs):
        return Response(self.get_serializer(self._attach_usage([self.get_object()])[0]).data)

    @extend_schema(
        responses=inline_serializer(
            "TranscodeStats",
            {
                "queued": serializers.IntegerField(),
                "transcoding": serializers.IntegerField(),
                "failed": serializers.IntegerField(),
                "ready": serializers.IntegerField(),
                "uploading": serializers.IntegerField(),
            },
        )
    )
    @action(detail=False, methods=["get"])
    def stats(self, request):
        counts = dict(VideoAsset.objects.values_list("status").annotate(n=Count("id")).order_by())
        return Response(
            {k: counts.get(k, 0) for k in ("queued", "transcoding", "failed", "ready", "uploading")}
        )

    @extend_schema(request=None, responses=VideoJobSerializer)
    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        asset = self.get_object()
        if asset.status in (VideoAsset.Status.UPLOADING, VideoAsset.Status.TRANSCODING):
            raise APIError("This video is still being processed.", "busy", 409)
        if not asset.source_key:
            raise APIError("The source file is missing.", "missing_source", 409)
        VideoAsset.objects.filter(pk=asset.pk).update(attempts=0)
        queue_transcode(asset)
        self._audit("retry", asset)
        asset.refresh_from_db()
        return Response(self.get_serializer(self._attach_usage([asset])[0]).data)

    @extend_schema(responses=PreviewSerializer)
    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        asset = self.get_object()
        if asset.status != VideoAsset.Status.READY:
            raise APIError("The video isn't ready yet.", "not_ready", 409)
        token = delivery.issue_token(str(asset.pk), request.user.pk)
        return Response(
            {
                "master_url": f"/api/v1/stream/{asset.pk}/master.m3u8?t={token}",
                "thumbnails_url": f"/api/v1/stream/{asset.pk}/thumbs.vtt?t={token}",
                "duration": asset.duration,
            }
        )

    @extend_schema(
        request={"multipart/form-data": SubtitleUploadSerializer},
        responses={201: SubtitleSerializer},
    )
    @action(detail=True, methods=["post"])
    def subtitles(self, request, pk=None):
        asset = self.get_object()
        data = SubtitleUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        upload = data.validated_data["file"]
        ext = upload.name.rsplit(".", 1)[-1].lower()
        if (
            ext not in (config.get_json("upload.allowed_subtitle_types") or ["vtt", "srt"])
            or upload.size > 5 * 1024 * 1024
        ):
            raise APIError(
                "Upload a .vtt or .srt subtitle file (max 5 MB).", "invalid_subtitle", 415
            )
        try:
            text = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise APIError("Subtitle files must be UTF-8 text.", "invalid_subtitle", 415) from exc
        vtt = delivery.srt_to_vtt(text)
        if "-->" not in vtt:
            raise APIError("No subtitle cues found in that file.", "invalid_subtitle", 415)
        lang = data.validated_data["language"]
        key = storage.put_bytes(
            f"subs/{asset.pk}/{lang}{'-forced' if data.validated_data['is_forced'] else ''}.vtt",
            vtt.encode(),
            "text/vtt",
            storage.SHORT_CACHE,
        )
        if data.validated_data["is_default"]:
            asset.subtitles.update(is_default=False)
        track, _ = SubtitleTrack.objects.update_or_create(
            asset=asset,
            language=lang,
            is_forced=data.validated_data["is_forced"],
            defaults={
                "label": data.validated_data["label"],
                "key": key,
                "is_default": data.validated_data["is_default"],
            },
        )
        self._audit("subtitle_add", asset, {"language": lang})
        return Response(SubtitleSerializer(track).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"subtitles/(?P<sub_id>\d+)")
    def delete_subtitle(self, request, pk=None, sub_id=None):
        asset = self.get_object()
        track = get_object_or_404(SubtitleTrack, pk=sub_id, asset=asset)
        self._audit("subtitle_delete", asset, {"language": track.language})
        track.delete()
        return Response(status=204)
