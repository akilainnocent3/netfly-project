"""Resumable browser → S3 multipart uploads. Django only signs; it never sees video bytes."""

from __future__ import annotations

import math
import uuid

import filetype
from django.db import transaction
from django.utils import timezone

from apps.core import storage
from apps.core.config import config
from apps.core.exceptions import APIError

from .models import UploadSession, VideoAsset

MAX_PARTS = 10_000
MIN_PART = 5 * 1024 * 1024
VIDEO_EXTENSIONS = {"mp4", "m4v", "mov", "mkv", "webm", "avi", "mxf", "ts"}


def _require_storage():
    if not storage.is_configured():
        raise APIError("Storage isn't configured yet. Add your S3 bucket in Settings → Storage & CDN.", "storage_not_configured", 409)


def part_size_for(size: int) -> int:
    configured = config.get_int("storage.multipart_part_size_mb", 16) * 1024 * 1024
    # Grow parts for huge files so we never exceed S3's 10,000-part limit.
    return max(MIN_PART, configured, math.ceil(size / MAX_PARTS))


def start(*, filename: str, size: int, content_type: str, kind: str, fingerprint: str, user) -> tuple[UploadSession, list[dict]]:
    """Create (or resume) a multipart upload. Returns the session and parts S3 already has."""
    _require_storage()
    max_bytes = config.get_float("upload.max_video_size_gb", 50.0) * 1024**3
    if size <= 0:
        raise APIError("That file is empty.", "validation_error")
    if size > max_bytes:
        raise APIError(f"Videos can be at most {config.get_float('upload.max_video_size_gb', 50.0):g} GB.", "file_too_large", 413)
    allowed = set(config.get_json("upload.allowed_video_types") or [])
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if content_type not in allowed and ext not in VIDEO_EXTENSIONS:
        raise APIError("That doesn't look like a video file (MP4, MOV, MKV or WebM).", "invalid_video", 415)

    existing = (
        UploadSession.objects.select_related("asset")
        .filter(fingerprint=fingerprint, created_by=user, status=UploadSession.Status.ACTIVE, size=size)
        .first()
    )
    if existing:
        return existing, list_parts(existing)

    s = storage.s3_settings()
    client = storage.client(s)
    asset_id = uuid.uuid4()
    key = storage.full_key(f"sources/{asset_id}/{_safe_name(filename)}", s)
    upload = client.create_multipart_upload(Bucket=s.bucket, Key=key, ContentType=content_type or "application/octet-stream")
    part_size = part_size_for(size)
    with transaction.atomic():
        asset = VideoAsset.objects.create(
            id=asset_id, kind=kind, status=VideoAsset.Status.UPLOADING, original_filename=filename[:255],
            source_key=key, source_size=size, source_content_type=content_type[:100], created_by=user,
        )
        session = UploadSession.objects.create(
            asset=asset, s3_upload_id=upload["UploadId"], key=key, filename=filename[:255], size=size,
            content_type=content_type[:100] or "application/octet-stream", part_size=part_size,
            part_count=math.ceil(size / part_size), fingerprint=fingerprint[:255], created_by=user,
        )
    return session, []


def _safe_name(filename: str) -> str:
    stem = "".join(c if c.isalnum() or c in "-_." else "_" for c in filename)[-120:]
    return stem or "source"


def list_parts(session: UploadSession) -> list[dict]:
    s = storage.s3_settings()
    client = storage.client(s)
    parts: list[dict] = []
    kwargs = {"Bucket": s.bucket, "Key": session.key, "UploadId": session.s3_upload_id}
    while True:
        page = client.list_parts(**kwargs)
        parts += [{"number": p["PartNumber"], "etag": p["ETag"], "size": p["Size"]} for p in page.get("Parts", [])]
        if not page.get("IsTruncated"):
            return parts
        kwargs["PartNumberMarker"] = page["NextPartNumberMarker"]


def sign_parts(session: UploadSession, numbers: list[int]) -> list[dict]:
    if session.status != UploadSession.Status.ACTIVE:
        raise APIError("This upload is no longer active.", "upload_closed", 409)
    s = storage.s3_settings()
    client = storage.client(s)
    out = []
    for n in numbers:
        if not 1 <= n <= session.part_count:
            raise APIError("Invalid part number.", "validation_error")
        url = client.generate_presigned_url(
            "upload_part",
            Params={"Bucket": s.bucket, "Key": session.key, "UploadId": session.s3_upload_id, "PartNumber": n},
            ExpiresIn=3600,
        )
        out.append({"number": n, "url": url})
    return out


def complete(session: UploadSession, parts: list[dict]) -> VideoAsset:
    if session.status != UploadSession.Status.ACTIVE:
        raise APIError("This upload is no longer active.", "upload_closed", 409)
    s = storage.s3_settings()
    client = storage.client(s)
    ordered = sorted(({"PartNumber": int(p["number"]), "ETag": p["etag"]} for p in parts), key=lambda p: p["PartNumber"])
    if [p["PartNumber"] for p in ordered] != list(range(1, session.part_count + 1)):
        raise APIError("Some parts are missing — the upload will resume them.", "parts_missing", 409)
    client.complete_multipart_upload(
        Bucket=s.bucket, Key=session.key, UploadId=session.s3_upload_id, MultipartUpload={"Parts": ordered}
    )
    head = client.head_object(Bucket=s.bucket, Key=session.key)
    asset = session.asset
    if head["ContentLength"] != session.size:
        raise APIError("The uploaded size doesn't match the file. Please upload again.", "size_mismatch", 409)
    # Sniff the real bytes: the browser-reported MIME type is not trusted.
    sample = client.get_object(Bucket=s.bucket, Key=session.key, Range="bytes=0-8191")["Body"].read()
    kind = filetype.guess(sample)
    if kind is None or not (kind.mime.startswith("video/") or kind.extension in VIDEO_EXTENSIONS):
        client.delete_object(Bucket=s.bucket, Key=session.key)
        session.status = UploadSession.Status.ABORTED
        session.save(update_fields=["status"])
        VideoAsset.objects.filter(pk=asset.pk).update(status=VideoAsset.Status.FAILED, error="Not a video file.")
        raise APIError("That file isn't a video.", "invalid_video", 415)
    session.status = UploadSession.Status.COMPLETED
    session.completed_at = timezone.now()
    session.save(update_fields=["status", "completed_at"])
    VideoAsset.objects.filter(pk=asset.pk).update(status=VideoAsset.Status.UPLOADED, source_content_type=kind.mime)
    from .tasks import queue_transcode

    asset.refresh_from_db()
    queue_transcode(asset)
    asset.refresh_from_db()
    return asset


def abort(session: UploadSession) -> None:
    if session.status == UploadSession.Status.ACTIVE:
        s = storage.s3_settings()
        try:
            storage.client(s).abort_multipart_upload(Bucket=s.bucket, Key=session.key, UploadId=session.s3_upload_id)
        except Exception:  # noqa: BLE001 - already gone on S3
            pass
    session.status = UploadSession.Status.ABORTED
    session.save(update_fields=["status"])
    VideoAsset.objects.filter(pk=session.asset_id, status=VideoAsset.Status.UPLOADING).delete()
