from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core import storage

from .models import ImageAsset, SubtitleTrack, VideoAsset


class ImageRefSerializer(serializers.ModelSerializer):
    """What viewers get: a loader key plus a blur placeholder."""

    key = serializers.CharField(read_only=True)
    blur = serializers.CharField(source="blur_data_url", read_only=True)
    color = serializers.CharField(source="dominant_color", read_only=True)

    class Meta:
        model = ImageAsset
        fields = ["key", "blur", "color", "width", "height"]


class NullableImageField(serializers.Field):
    def to_representation(self, value):
        if value is None or value.status != ImageAsset.Status.READY:
            return None
        return ImageRefSerializer(value).data

    def to_internal_value(self, data):
        raise NotImplementedError


ImageRef = extend_schema_field(ImageRefSerializer(allow_null=True))(NullableImageField)


class AdminImageSerializer(serializers.ModelSerializer):
    key = serializers.CharField(read_only=True)
    original_url = serializers.SerializerMethodField()

    class Meta:
        model = ImageAsset
        fields = [
            "id", "kind", "status", "key", "width", "height", "blur_data_url", "dominant_color",
            "original_width", "original_height", "crop", "widths", "formats", "error", "original_url",
            "created_at",
        ]
        read_only_fields = [f for f in fields if f != "crop"]

    def get_original_url(self, obj) -> str:
        return storage.presign_get(obj.original_key, 3600) if obj.original_key else ""

    def validate_crop(self, value):
        try:
            x, y, w, h = (float(value[k]) for k in ("x", "y", "w", "h"))
        except (KeyError, TypeError, ValueError) as exc:
            raise serializers.ValidationError("Crop needs x, y, w and h.") from exc
        if not (0 <= x < 1 and 0 <= y < 1 and 0 < w <= 1 and 0 < h <= 1 and x + w <= 1.0001 and y + h <= 1.0001):
            raise serializers.ValidationError("Crop must stay inside the image.")
        return {"x": round(x, 5), "y": round(y, 5), "w": round(w, 5), "h": round(h, 5)}


class ImageUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    kind = serializers.ChoiceField(choices=ImageAsset.Kind.choices)


class SubtitleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubtitleTrack
        fields = ["id", "language", "label", "is_default", "is_forced", "created_at"]


class RenditionSerializer(serializers.Serializer):
    name = serializers.CharField()
    height = serializers.IntegerField()
    width = serializers.IntegerField()
    bandwidth = serializers.IntegerField()
    avg_bandwidth = serializers.IntegerField()
    codecs = serializers.CharField()
    codec = serializers.CharField(required=False)


class AudioTrackSerializer(serializers.Serializer):
    name = serializers.CharField()
    language = serializers.CharField()
    default = serializers.BooleanField(required=False)


class AdminVideoSerializer(serializers.ModelSerializer):
    subtitles = SubtitleSerializer(many=True, read_only=True)
    renditions = RenditionSerializer(many=True, read_only=True)
    audio_tracks = AudioTrackSerializer(many=True, read_only=True)

    class Meta:
        model = VideoAsset
        fields = [
            "id", "kind", "status", "progress", "stage", "original_filename", "source_size", "duration",
            "source_width", "source_height", "source_fps", "source_codec", "renditions", "audio_tracks",
            "sprite", "attempts", "error", "log", "queued_at", "started_at", "finished_at", "created_at",
            "subtitles",
        ]
        read_only_fields = fields
