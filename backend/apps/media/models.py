import uuid

from django.conf import settings
from django.db import models


class ImageAsset(models.Model):
    """An uploaded image, re-encoded server-side into fixed-width AVIF/WebP variants."""

    class Kind(models.TextChoices):
        POSTER = "poster"  # 2:3
        BACKDROP = "backdrop"  # 16:9
        LOGO = "logo"  # transparent title art
        THUMBNAIL = "thumbnail"  # 16:9 episode stills
        ARTWORK = "artwork"  # category tiles (13

    class Status(models.TextChoices):
        PROCESSING = "processing"
        READY = "ready"
        FAILED = "failed"

    ASPECTS = {"poster": 2 / 3, "backdrop": 16 / 9, "thumbnail": 16 / 9, "artwork": 16 / 9}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PROCESSING)
    original_key = models.CharField(max_length=255)
    original_width = models.PositiveIntegerField(default=0)
    original_height = models.PositiveIntegerField(default=0)
    # Normalised crop rectangle {x, y, w, h} in 0..1 of the original.
    crop = models.JSONField(default=dict, blank=True)
    version = models.PositiveIntegerField(default=1)
    widths = models.JSONField(default=list, blank=True)
    formats = models.JSONField(default=list, blank=True)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    blur_data_url = models.TextField(blank=True)
    dominant_color = models.CharField(max_length=7, blank=True)
    error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.kind}:{self.id}"

    @property
    def key(self) -> str:
        """Public image key used by the frontends' loader: images/<id>/v<version>."""
        return f"images/{self.id}/v{self.version}"

    def variant_key(self, width: int, fmt: str) -> str:
        return f"{self.key}/w{width}.{fmt}"


class VideoAsset(models.Model):
    class Status(models.TextChoices):
        UPLOADING = "uploading"
        UPLOADED = "uploaded"
        QUEUED = "queued"
        TRANSCODING = "transcoding"
        READY = "ready"
        FAILED = "failed"

    class Kind(models.TextChoices):
        FEATURE = "feature"
        EPISODE = "episode"
        TRAILER = "trailer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.FEATURE)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.UPLOADING, db_index=True
    )
    progress = models.FloatField(default=0)
    stage = models.CharField(max_length=60, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    source_key = models.CharField(max_length=255, blank=True)
    source_size = models.BigIntegerField(default=0)
    source_content_type = models.CharField(max_length=100, blank=True)
    duration = models.FloatField(default=0)
    source_width = models.PositiveIntegerField(default=0)
    source_height = models.PositiveIntegerField(default=0)
    source_fps = models.FloatField(default=0)
    source_codec = models.CharField(max_length=40, blank=True)
    hls_prefix = models.CharField(max_length=255, blank=True)
    master_key = models.CharField(max_length=255, blank=True)
    # [{name, height, width, bandwidth, avg_bandwidth, codecs, playlist, frame_rate}]
    renditions = models.JSONField(default=list, blank=True)
    # [{name, language, bandwidth, codecs, playlist, channels}]
    audio_tracks = models.JSONField(default=list, blank=True)
    sprite = models.JSONField(
        default=dict, blank=True
    )  # {interval, columns, width, height, sheets: [keys], count}
    poster_frame_key = models.CharField(max_length=255, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    log = models.TextField(blank=True)
    ladder_snapshot = models.JSONField(default=list, blank=True)
    queued_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self) -> str:
        return f"video:{self.id}"

    @property
    def is_ready(self) -> bool:
        return self.status == self.Status.READY


class SubtitleTrack(models.Model):
    asset = models.ForeignKey(VideoAsset, on_delete=models.CASCADE, related_name="subtitles")
    language = models.CharField(max_length=12)
    label = models.CharField(max_length=60)
    key = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)
    is_forced = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["language"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset", "language", "is_forced"], name="subtitle_unique_lang"
            )
        ]

    def __str__(self) -> str:
        return f"{self.asset_id}:{self.language}"


class UploadSession(models.Model):
    """A resumable S3 multipart upload started from the admin app."""

    class Status(models.TextChoices):
        ACTIVE = "active"
        COMPLETED = "completed"
        ABORTED = "aborted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.OneToOneField(VideoAsset, on_delete=models.CASCADE, related_name="upload")
    s3_upload_id = models.CharField(max_length=1024)
    key = models.CharField(max_length=255)
    filename = models.CharField(max_length=255)
    size = models.BigIntegerField()
    content_type = models.CharField(max_length=100)
    part_size = models.BigIntegerField()
    part_count = models.PositiveIntegerField()
    # Client fingerprint (name+size+mtime) lets a refreshed page find and resume this upload.
    fingerprint = models.CharField(max_length=255, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"upload:{self.id}"
