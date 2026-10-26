"""Studio → Video extraction API (`/api/v1/admin/extraction/…`).

Content managers and superadmins only (analysts get 403). Every write is audit-logged and every
endpoint is rate-limited (`security.rate_extraction*`).
"""

import csv
import re

from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.adminapi.mixins import AdminPagination, AuditedMixin, diff
from apps.core.config import config
from apps.core.exceptions import APIError
from apps.core.throttling import throttle

from . import serializers as s
from .crawler import effective_options
from .models import ApprovedEmbed, DiscoveredLink, ExtractionJob
from .safety import BlockedURL, check_url
from .sanitize import build_iframe, sanitize_embed_html
from .tasks import check_link, fail_stale_jobs, run_job
from .urls_norm import host_of, origin_of

R = User.Role
ROLES = (R.CONTENT_MANAGER,)  # superadmin is always allowed; analysts are not
PREVIEW_SALT = "extraction-preview"
PREVIEW_SECONDS = 900
ORIGIN_RE = re.compile(r"^https?://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$", re.I)
KIND_GROUPS = {
    "pages": [DiscoveredLink.Kind.PAGE],
    "videos": [DiscoveredLink.Kind.VIDEO_FILE, DiscoveredLink.Kind.STREAM],
    "embeds": [DiscoveredLink.Kind.EMBED],
    "other": [DiscoveredLink.Kind.IMAGE, DiscoveredLink.Kind.DOCUMENT, DiscoveredLink.Kind.OTHER],
}
LINK_ORDERING = {
    "id",
    "-id",
    "url",
    "-url",
    "kind",
    "-kind",
    "depth",
    "-depth",
    "http_status",
    "-http_status",
    "check_status",
    "-check_status",
    "found_on",
    "-found_on",
}

read_limit = throttle("security.rate_extraction", per_user=True)
write_limit = throttle("security.rate_extraction_write", per_user=True)
start_limit = throttle("security.rate_extraction_start", per_user=True)


class CSVRenderer(BaseRenderer):
    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data if isinstance(data, bytes | str) else b""


class Echo:
    def write(self, value):
        return value


class ExtractionBase(AuditedMixin):
    read_roles = ROLES
    write_roles = ROLES

    def get_throttles(self):
        cls = write_limit if self.request.method not in ("GET", "HEAD", "OPTIONS") else read_limit
        return [cls()]


LINK_FILTERS = [
    OpenApiParameter("kind", str, description="Comma list of kinds, or pages|videos|embeds|other"),
    OpenApiParameter("internal", bool),
    OpenApiParameter("check_status", str, enum=[c for c, _ in DiscoveredLink.CheckStatus.choices]),
    OpenApiParameter("has_video", bool),
    OpenApiParameter("search", str),
    OpenApiParameter("ordering", str, enum=sorted(LINK_ORDERING)),
]


class JobViewSet(
    ExtractionBase, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    audit_type = "extraction_job"
    pagination_class = AdminPagination
    queryset = ExtractionJob.objects.select_related("created_by")

    def get_serializer_class(self):
        if self.action == "retrieve":
            return s.ExtractionJobDetailSerializer
        if self.action == "links":
            return s.ExtractionLinkSerializer
        return s.ExtractionJobSerializer

    def get_throttles(self):
        if self.action == "create":
            return [start_limit()]
        return super().get_throttles()

    @extend_schema(
        request=s.ExtractionJobCreateSerializer,
        responses={201: s.ExtractionJobSerializer},
        operation_id="admin_extraction_jobs_create",
    )
    def create(self, request):
        data = s.ExtractionJobCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            target = check_url(data.validated_data["url"])
        except BlockedURL as exc:
            raise APIError(exc.message, exc.code, 400, fields={"url": exc.message}) from None
        fail_stale_jobs()  # a dead worker's job must not hold a slot forever
        limit = config.get_int("extraction.max_concurrent_jobs", 2)
        with transaction.atomic():
            # Lock this person's row so two quick clicks can't both pass the limit.
            User.objects.select_for_update().filter(pk=request.user.pk).first()
            running = ExtractionJob.objects.filter(
                created_by=request.user, status__in=ExtractionJob.ACTIVE
            ).count()
            if running >= limit:
                raise APIError(
                    f"You already have {running} crawl{'s' if running != 1 else ''} running. "
                    "Wait for one to finish or cancel it.",
                    "too_many_jobs",
                    429,
                )
            job = ExtractionJob.objects.create(
                start_url=target.url.split("#", 1)[0],
                options=effective_options(data.validated_data.get("options") or {}),
                created_by=request.user,
            )
            self._audit("create", job, {"url": job.start_url, "options": job.options})
            transaction.on_commit(lambda: run_job.delay(str(job.pk)))
        job.refresh_from_db()
        return Response(s.ExtractionJobSerializer(job).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=s.ExtractionJobSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        job = self.get_object()
        updated = ExtractionJob.objects.filter(pk=job.pk, status__in=ExtractionJob.ACTIVE).update(
            status=ExtractionJob.Status.CANCELLED, finished_at=timezone.now(), current_url=""
        )
        if not updated:
            raise APIError("This crawl has already finished.", "not_running", 409)
        job.refresh_from_db()
        self._audit("cancel", job)
        return Response(s.ExtractionJobSerializer(job).data)

    @extend_schema(parameters=LINK_FILTERS, responses=s.ExtractionLinkSerializer(many=True))
    @action(detail=True, methods=["get"], renderer_classes=[JSONRenderer, CSVRenderer])
    def links(self, request, pk=None):
        job = self.get_object()
        qs = filter_links(job.links.all(), request.query_params)
        if request.accepted_renderer.format == "csv":
            return csv_response(job, qs)
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(s.ExtractionLinkSerializer(page, many=True).data)


def filter_links(qs, p):
    if kinds := p.get("kind", "").strip():
        wanted: list[str] = []
        for part in kinds.split(","):
            wanted += KIND_GROUPS.get(part, [part])
        qs = qs.filter(kind__in=wanted)
    if (internal := p.get("internal")) in ("true", "1", "false", "0"):
        qs = qs.filter(is_internal=internal in ("true", "1"))
    if status_ := p.get("check_status"):
        qs = qs.filter(check_status=status_)
    if p.get("has_video") in ("true", "1"):
        qs = qs.filter(has_video=True)
    if search := p.get("search", "").strip():
        qs = qs.filter(Q(url__icontains=search) | Q(title__icontains=search))
    ordering = p.get("ordering", "id")
    return qs.order_by(ordering if ordering in LINK_ORDERING else "id", "id")


CSV_FIELDS = [
    "url",
    "kind",
    "source",
    "found_on",
    "depth",
    "http_status",
    "content_type",
    "title",
    "is_internal",
    "has_video",
    "check_status",
    "error",
]


def _csv_cell(value) -> str:
    text = "" if value is None else str(value)
    # Spreadsheet formula injection: a cell starting with = + - @ is shown as text.
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def csv_response(job, qs):
    writer = csv.writer(Echo())

    def rows():
        yield "﻿" + writer.writerow(CSV_FIELDS)
        for link in qs.values_list(*CSV_FIELDS).iterator(chunk_size=1000):
            yield writer.writerow([_csv_cell(v) for v in link])

    host = host_of(job.start_url).replace(".", "-") or "site"
    response = StreamingHttpResponse(rows(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="netfly-links-{host}.csv"'
    return response


# ---- links -----------------------------------------------------------------------------------


class LinkViewSet(ExtractionBase, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    audit_type = "extraction_link"
    queryset = DiscoveredLink.objects.all()
    serializer_class = s.ExtractionLinkDetailSerializer

    @extend_schema(
        request=s.LinkCheckRequestSerializer, responses={202: s.ExtractionLinkDetailSerializer}
    )
    @action(detail=True, methods=["post"])
    def check(self, request, pk=None):
        link = self.get_object()
        body = s.LinkCheckRequestSerializer(data=request.data or {})
        body.is_valid(raise_exception=True)
        if link.check_status != DiscoveredLink.CheckStatus.CHECKING or body.validated_data["force"]:
            DiscoveredLink.objects.filter(pk=link.pk).update(
                check_status=DiscoveredLink.CheckStatus.CHECKING
            )
            force = body.validated_data["force"]
            transaction.on_commit(lambda: check_link.delay(link.pk, force))
            self._audit("check", link, {"url": link.url, "force": force})
        link.refresh_from_db()
        return Response(
            s.ExtractionLinkDetailSerializer(link).data, status=status.HTTP_202_ACCEPTED
        )

    @extend_schema(
        parameters=[OpenApiParameter("video", str, description='Video index, or "page"')],
        responses=s.ExtractionPreviewTokenSerializer,
    )
    @action(detail=True, methods=["get"], url_path="preview-token")
    def preview_token(self, request, pk=None):
        link = self.get_object()
        choice = request.query_params.get("video", "page")
        choice = "page" if choice == "page" else _index(choice)
        resolve_link_embed(link, choice, require_yes=False)  # 404/409 before handing out a token
        token = signing.dumps({"l": link.pk, "v": choice, "u": request.user.pk}, salt=PREVIEW_SALT)
        return Response({"token": token, "expires_in": PREVIEW_SECONDS})

    @extend_schema(request=s.EmbedApproveSerializer, responses={201: s.ApprovedEmbedSerializer})
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        link = self.get_object()
        body = s.EmbedApproveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        embed = resolve_link_embed(link, data["video_index"], require_yes=True)
        if ApprovedEmbed.objects.filter(
            status=ApprovedEmbed.Status.APPROVED,
            original_url=embed["original_url"],
            embed_url=embed["embed_url"],
        ).exists():
            raise APIError("This video is already saved for the client.", "already_approved", 409)
        with transaction.atomic():
            approved = ApprovedEmbed.objects.create(
                link=link,
                original_url=embed["original_url"],
                page_url=link.found_on or link.url,
                embed_type=embed["embed_type"],
                embed_url=embed["embed_url"],
                embed_html=embed["embed_html"],
                provider=embed["provider"][:100],
                title=data["title"].strip(),
                description=data["description"].strip(),
                thumbnail_url=embed["thumbnail_url"][:2048],
                thumbnail_data=embed["thumbnail_data"],
                duration=embed["duration"],
                width=embed["width"],
                height=embed["height"],
                netfly_title_id=data.get("netfly_title_id"),
                origins=embed["origins"],
                rights_confirmed=True,
                rights_note=data.get("note", ""),
                approved_by=request.user,
            )
            record_embed(
                request,
                "approve",
                approved,
                {
                    "url": approved.original_url,
                    "embed_type": approved.embed_type,
                    "embed_url": approved.embed_url,
                    "title": approved.title,
                    "netfly_title": approved.netfly_title_id,
                    "rights_confirmed": True,
                    "note": approved.rights_note,
                },
            )
        return Response(s.ApprovedEmbedSerializer(approved).data, status=status.HTTP_201_CREATED)


def _index(value) -> int:
    try:
        index = int(value)
    except (TypeError, ValueError):
        raise APIError('Choose a video (its index) or "page".', "invalid_video", 400) from None
    if index < 0:
        raise APIError('Choose a video (its index) or "page".', "invalid_video", 400)
    return index


def _clean_origins(urls) -> list[str]:
    out = []
    for url in urls:
        try:
            origin = origin_of(url) if "://" in url else ""
        except ValueError:
            continue
        if ORIGIN_RE.match(origin) and origin not in out:
            out.append(origin)
    return out


def preview_origins(embed_type: str, src: str, extra: list[str] | None = None) -> dict:
    origins = _clean_origins([src, *(extra or [])])
    if embed_type in ("iframe", "oembed"):
        return {"frame": _clean_origins([src]), "media": [], "connect": []}
    if embed_type == "mp4":
        return {"frame": [], "media": origins, "connect": origins}
    return {"frame": [], "media": origins, "connect": origins}  # hls / dash: fetched by script


def resolve_link_embed(link: DiscoveredLink, choice, *, require_yes: bool) -> dict:
    """What approving (or previewing) `choice` of this link's check would save."""
    result = link.check_result or {}
    if link.check_status != DiscoveredLink.CheckStatus.CHECKED or "videos" not in result:
        raise APIError("Check this link first.", "not_checked", 409)
    if choice == "page":
        verdict = result.get("page_embeddable", {}).get("verdict")
        src = result.get("final_url") or link.url
        embed = {
            "original_url": link.url,
            "embed_type": ApprovedEmbed.EmbedType.IFRAME,
            "embed_url": src,
            "embed_html": build_iframe(src, title=result.get("title") or ""),
            "provider": host_of(src),
            "title": result.get("title") or "",
            "thumbnail_url": result.get("thumbnail") or "",
            "thumbnail_data": result.get("thumbnail_data") or "",
            "duration": None,
            "width": None,
            "height": None,
            "verdict": verdict,
            "reasons": result.get("page_embeddable", {}).get("reasons", []),
        }
    else:
        videos = result.get("videos") or []
        if choice >= len(videos):
            raise APIError("That video isn't in this link's check.", "invalid_video", 400)
        video = videos[choice]
        code = video.get("embed") or {}
        src = code.get("src") or ""
        if not src:
            raise APIError("This video has nothing NETFLY can embed.", "not_embeddable", 409)
        embed_type = code.get("type") or "iframe"
        html = ""
        if embed_type in ("iframe", "oembed"):
            clean = sanitize_embed_html(code.get("html") or "", {host_of(src)})
            html = clean[0] if clean else build_iframe(src, title=video.get("title") or "")
        embed = {
            "original_url": video.get("url") or link.url,
            "embed_type": embed_type,
            "embed_url": src,
            "embed_html": html,
            "provider": video.get("provider") or host_of(src),
            "title": video.get("title") or result.get("title") or "",
            "thumbnail_url": video.get("thumbnail") or result.get("thumbnail") or "",
            "thumbnail_data": video.get("thumbnail_data") or result.get("thumbnail_data") or "",
            "duration": video.get("duration"),
            "width": video.get("width"),
            "height": video.get("height"),
            "verdict": (video.get("playable_in_netfly") or {}).get("verdict"),
            "reasons": (video.get("playable_in_netfly") or {}).get("reasons", []),
            "extra_origins": video.get("origins") or [],
        }
    if require_yes and embed["verdict"] != "yes":
        raise APIError(
            "Only a video (or page) with a “yes” verdict can be approved.", "not_embeddable", 409
        )
    embed["origins"] = preview_origins(
        embed["embed_type"], embed["embed_url"], embed.pop("extra_origins", [])
    )
    return embed


def record_embed(request, action_name: str, embed: ApprovedEmbed, changes: dict) -> None:
    from apps.core.audit import client_ip, record

    record(
        request.user, f"approved_embed.{action_name}", embed, changes=changes, ip=client_ip(request)
    )


# ---- approved embeds ---------------------------------------------------------------------------


class EmbedViewSet(ExtractionBase, mixins.ListModelMixin, viewsets.GenericViewSet):
    audit_type = "approved_embed"
    pagination_class = AdminPagination
    serializer_class = s.ApprovedEmbedSerializer
    queryset = ApprovedEmbed.objects.select_related(
        "netfly_title", "approved_by", "revoked_by", "link"
    )

    def get_queryset(self):
        qs = super().get_queryset()
        if status_ := self.request.query_params.get("status"):
            qs = qs.filter(status=status_)
        if search := self.request.query_params.get("search", "").strip():
            qs = qs.filter(Q(title__icontains=search) | Q(original_url__icontains=search))
        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter("status", str, enum=[c for c, _ in ApprovedEmbed.Status.choices]),
            OpenApiParameter("search", str),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=s.EmbedUpdateSerializer, responses=s.ApprovedEmbedSerializer)
    def partial_update(self, request, pk=None):
        embed = self.get_object()
        body = s.EmbedUpdateSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        fields = ("title", "description", "netfly_title_id", "rights_note")
        before = {f: getattr(embed, f) for f in fields}
        for key, value in body.validated_data.items():
            setattr(embed, key, value)
        embed.save()
        changes = diff(before, {f: getattr(embed, f) for f in fields})
        if changes:
            self._audit("update", embed, changes)
        embed.refresh_from_db()
        return Response(s.ApprovedEmbedSerializer(embed).data)

    @extend_schema(request=None, responses=s.ApprovedEmbedSerializer)
    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        embed = self.get_object()
        if embed.status == ApprovedEmbed.Status.REVOKED:
            raise APIError("This embed is already revoked.", "already_revoked", 409)
        embed.status = ApprovedEmbed.Status.REVOKED
        embed.revoked_by = request.user
        embed.revoked_at = timezone.now()
        embed.save(update_fields=["status", "revoked_by", "revoked_at", "updated_at"])
        self._audit("revoke", embed, {"title": embed.title, "url": embed.original_url})
        return Response(s.ApprovedEmbedSerializer(embed).data)

    @extend_schema(responses=s.ExtractionPreviewTokenSerializer)
    @action(detail=True, methods=["get"], url_path="preview-token")
    def preview_token(self, request, pk=None):
        embed = self.get_object()
        token = signing.dumps({"e": embed.pk, "u": request.user.pk}, salt=PREVIEW_SALT)
        return Response({"token": token, "expires_in": PREVIEW_SECONDS})


# ---- preview (for Studio's preview route, called server-side by its middleware) ---------------


class PreviewView(APIView):
    """What `/extraction/preview/…` in Studio renders, and the only origins its CSP may add.

    Authenticated by a short-lived signed token that an authorised staff member obtained for
    one link (or embed); the origins come from the stored check, never from the request.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_extraction")]

    @extend_schema(
        parameters=[OpenApiParameter("token", str, required=True)],
        responses={
            200: s.ExtractionPreviewSerializer,
            404: OpenApiResponse(description="Invalid or expired token"),
        },
        operation_id="admin_extraction_preview",
    )
    def get(self, request):
        try:
            data = signing.loads(
                request.query_params.get("token", ""), salt=PREVIEW_SALT, max_age=PREVIEW_SECONDS
            )
        except signing.BadSignature:
            raise APIError(
                "This preview link has expired. Open it again from Studio.", "invalid_token", 404
            ) from None
        user = User.objects.filter(pk=data.get("u"), is_active=True, is_staff=True).first()
        if user is None or not user.has_role(*ROLES):
            raise APIError(
                "This preview link has expired. Open it again from Studio.", "invalid_token", 404
            )
        if "e" in data:
            embed = get_object_or_404(ApprovedEmbed, pk=data["e"])
            code = {"type": embed.embed_type, "src": embed.embed_url, "html": embed.embed_html}
            origins = embed.origins or preview_origins(embed.embed_type, embed.embed_url)
            return Response(
                {
                    "title": embed.title,
                    "embed": code,
                    "origins": origins,
                    "verdict": "yes",
                    "reasons": [],
                }
            )
        link = get_object_or_404(DiscoveredLink, pk=data.get("l"))
        embed = resolve_link_embed(link, data.get("v"), require_yes=False)
        return Response(
            {
                "title": embed["title"],
                "embed": {
                    "type": embed["embed_type"],
                    "src": embed["embed_url"],
                    "html": embed["embed_html"],
                },
                "origins": embed["origins"],
                "verdict": embed["verdict"] or "unknown",
                "reasons": embed["reasons"],
            }
        )


class CapabilitiesView(ExtractionBase, APIView):
    """Defaults for the start form, and whether an extraction worker can render JavaScript."""

    @extend_schema(
        responses=s.ExtractionCapabilitiesSerializer, operation_id="admin_extraction_capabilities"
    )
    def get(self, request):
        from django.core.cache import cache

        from netfly.celery import app

        caps = cache.get("extraction:capabilities")
        if caps is None:
            try:
                replies = app.control.broadcast("netfly_extraction", reply=True, timeout=1.0)
            except Exception:  # noqa: BLE001 - broker unreachable reads as "no worker"
                replies = []
            workers = [
                r
                for reply in replies or []
                for r in reply.values()
                if isinstance(r, dict) and r.get("extraction")
            ]
            render = [w for w in workers if w.get("render_js")]
            caps = {
                "worker": bool(workers),
                "render_js": bool(render),
                "render_js_reason": (
                    ""
                    if render
                    else (
                        workers[0].get("render_js_reason", "")
                        if workers
                        else "No extraction worker is running, so JavaScript rendering can't be checked."
                    )
                ),
                "ffprobe": any(w.get("ffprobe") for w in workers),
            }
            cache.set("extraction:capabilities", caps, 60 if workers else 10)
        return Response(
            {
                **caps,
                "max_pages": config.get_int("extraction.max_pages", 200),
                "max_depth": config.get_int("extraction.max_depth", 2),
                "max_links": config.get_int("extraction.max_links", 5000),
                "respect_robots": config.get_bool("extraction.respect_robots", True),
                "max_concurrent_jobs": config.get_int("extraction.max_concurrent_jobs", 2),
            }
        )
