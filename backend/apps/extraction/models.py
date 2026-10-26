"""Studio → Video extraction: crawl a site, check its links, approve embeds for the client.

An `ApprovedEmbed` is the hand-off to the viewer app. Nothing reads it there yet (decision 72).
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

URL_MAX = 2048


class ExtractionJob(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued"
        CRAWLING = "crawling"
        DONE = "done"
        FAILED = "failed"
        CANCELLED = "cancelled"

    ACTIVE = (Status.QUEUED, Status.CRAWLING)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    start_url = models.CharField(max_length=URL_MAX)
    normalized_origin = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.QUEUED)
    progress = models.FloatField(default=0)
    pages_crawled = models.PositiveIntegerField(default=0)
    links_found = models.PositiveIntegerField(default=0)
    current_url = models.CharField(max_length=URL_MAX, blank=True)
    # max_pages, max_depth, same_domain_only, same_host_only, render_js, respect_robots
    options = models.JSONField(default=dict)
    # Why the crawl stopped early (limits, robots.txt), shown next to the counts.
    notes = models.JSONField(default=list, blank=True)
    error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["created_by", "status"])]

    def __str__(self) -> str:
        return self.start_url[:255]


class DiscoveredLink(models.Model):
    class Kind(models.TextChoices):
        PAGE = "page"
        VIDEO_FILE = "video_file"
        STREAM = "stream"
        EMBED = "embed"
        IMAGE = "image"
        DOCUMENT = "document"
        OTHER = "other"

    VIDEO_KINDS = (Kind.VIDEO_FILE, Kind.STREAM, Kind.EMBED)

    class Source(models.TextChoices):
        START = "start"
        A_HREF = "a_href"
        LINK = "link"
        IFRAME = "iframe"
        VIDEO_SRC = "video_src"
        SOURCE_SRC = "source_src"
        IMG = "img"
        SRCSET = "srcset"
        OG_VIDEO = "og_video"
        JSON_LD = "json_ld"
        SITEMAP = "sitemap"
        SCRIPT = "script"
        OEMBED = "oembed"
        REDIRECT = "redirect"
        RENDERED = "rendered"

    class CheckStatus(models.TextChoices):
        UNCHECKED = "unchecked"
        CHECKING = "checking"
        CHECKED = "checked"
        FAILED = "failed"

    job = models.ForeignKey(ExtractionJob, on_delete=models.CASCADE, related_name="links")
    url = models.CharField(max_length=URL_MAX)
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.OTHER)
    source = models.CharField(max_length=12, choices=Source.choices, default=Source.A_HREF)
    found_on = models.CharField(max_length=URL_MAX, blank=True)
    depth = models.PositiveSmallIntegerField(default=0)
    http_status = models.PositiveSmallIntegerField(null=True, blank=True)
    content_type = models.CharField(max_length=255, blank=True)
    title = models.CharField(max_length=500, blank=True)
    is_internal = models.BooleanField(default=True)
    # The crawl recorded a per-page problem here (timeout, TLS, 5xx…) instead of failing the job.
    error = models.CharField(max_length=300, blank=True)
    # Video, stream or embed found by the crawl, or a check that found at least one video.
    has_video = models.BooleanField(default=False)
    check_status = models.CharField(
        max_length=10, choices=CheckStatus.choices, default=CheckStatus.UNCHECKED
    )
    check_result = models.JSONField(null=True, blank=True)
    checked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["job", "url"], name="extraction_link_unique_url")
        ]
        indexes = [
            models.Index(fields=["job", "kind"]),
            models.Index(fields=["job", "is_internal"]),
            models.Index(fields=["job", "check_status"]),
            models.Index(fields=["job", "has_video"]),
        ]

    def __str__(self) -> str:
        return self.url[:255]


class ApprovedEmbed(models.Model):
    """A checked video that staff confirmed NETFLY may show. Not read by the viewer app yet."""

    class EmbedType(models.TextChoices):
        IFRAME = "iframe"
        OEMBED = "oembed"
        HLS = "hls"
        MP4 = "mp4"
        DASH = "dash"

    class Status(models.TextChoices):
        APPROVED = "approved"
        REVOKED = "revoked"

    link = models.ForeignKey(
        DiscoveredLink, null=True, blank=True, on_delete=models.SET_NULL, related_name="embeds"
    )
    original_url = models.CharField(max_length=URL_MAX)
    page_url = models.CharField(max_length=URL_MAX, blank=True)
    embed_type = models.CharField(max_length=8, choices=EmbedType.choices)
    embed_url = models.CharField(max_length=URL_MAX, blank=True)
    embed_html = models.TextField(blank=True)  # sanitised: one iframe from an allowed host
    provider = models.CharField(max_length=100, blank=True)
    # What viewers will read: written (or confirmed) by staff for every embed.
    title = models.CharField(max_length=300)
    description = models.TextField()
    thumbnail_url = models.CharField(max_length=URL_MAX, blank=True)
    # A small server-fetched JPEG (data: URI) for Studio, whose CSP doesn't allow image hosts.
    thumbnail_data = models.TextField(blank=True)
    duration = models.FloatField(null=True, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    netfly_title = models.ForeignKey(
        "catalog.Title",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_embeds",
    )
    # Origins the preview needs in its CSP (frame-src / media-src / connect-src).
    origins = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.APPROVED)
    rights_confirmed = models.BooleanField(default=False)
    rights_note = models.TextField(blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    approved_at = models.DateTimeField(auto_now_add=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    revoked_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-approved_at"]
        constraints = [
            # Approval without the rights confirmation is impossible, not merely validated.
            models.CheckConstraint(
                condition=Q(rights_confirmed=True), name="extraction_embed_rights_confirmed"
            ),
        ]
        indexes = [models.Index(fields=["status", "-approved_at"])]

    def __str__(self) -> str:
        return self.title[:255]
