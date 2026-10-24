import datetime as dt

from django.contrib.postgres.search import TrigramSimilarity
from django.db import transaction
from django.db.models import Count, Max, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import StaffPermission
from apps.catalog import services
from apps.catalog.models import (
    Billboard,
    Collection,
    Episode,
    Genre,
    HomeRow,
    RelatedTitle,
    Season,
    Title,
)
from apps.core.audit import client_ip, record
from apps.core.config import config
from apps.core.exceptions import APIError
from apps.core.throttling import throttle
from apps.media import images
from apps.media.models import ImageAsset, VideoAsset
from apps.media.serializers import (
    AdminImageSerializer,
    AdminVideoSerializer,
    ImageUploadSerializer,
)
from apps.media.tasks import queue_generate
from apps.media.transcode import timecode
from apps.recommendations.cache import bump_catalog_on_commit

from . import serializers as s
from .mixins import AdminPagination, AuditedMixin

TITLE_FILTERS = [
    OpenApiParameter("search", str),
    OpenApiParameter("type", str, enum=["movie", "series"]),
    OpenApiParameter("status", str, enum=["draft", "processing", "published", "archived"]),
    OpenApiParameter("translation", str, enum=["translated", "not_translated"]),
    OpenApiParameter("genre", int),
    OpenApiParameter("featured", bool),
    OpenApiParameter(
        "ordering",
        str,
        enum=["-updated_at", "title", "-published_at", "-popularity", "year", "-boost", "boost"],
    ),
    OpenApiParameter("priority", str, enum=["boosted", "demoted", "normal"]),
]


class TitleViewSet(AuditedMixin, viewsets.ModelViewSet):
    audit_type = "title"
    pagination_class = AdminPagination
    serializer_class = s.TitleAdminSerializer

    def get_queryset(self):
        qs = Title.objects.all()
        if self.action == "list":
            qs = (
                qs.select_related("poster", "video")
                .prefetch_related("genres")
                .annotate(
                    season_count=Count("seasons", distinct=True),
                    episode_count=Count("seasons__episodes", distinct=True),
                )
            )
            p = self.request.query_params
            if search := p.get("search", "").strip():
                qs = qs.annotate(sim=TrigramSimilarity("title", search)).filter(
                    Q(title__icontains=search)
                    | Q(original_title__icontains=search)
                    | Q(sim__gt=0.2)
                )
            for field, param in (
                ("type", "type"),
                ("status", "status"),
                ("translation_status", "translation"),
            ):
                if value := p.get(param):
                    qs = qs.filter(**{field: value})
            if genre := p.get("genre"):
                qs = qs.filter(genres__id=genre)
            if p.get("featured") in ("true", "1"):
                qs = qs.filter(is_featured=True)
            priority = p.get("priority")
            if priority == "boosted":
                qs = qs.filter(boost__gt=0)
            elif priority == "demoted":
                qs = qs.filter(boost__lt=0)
            elif priority == "normal":
                qs = qs.filter(boost=0)
            ordering = p.get("ordering", "-updated_at")
            if search and ordering == "-updated_at":
                ordering = "-sim"
            allowed = {
                "-updated_at",
                "title",
                "-published_at",
                "-popularity",
                "year",
                "-sim",
                "-boost",
                "boost",
            }
            return qs.order_by(ordering if ordering in allowed else "-updated_at", "-id")
        return qs.select_related("poster", "backdrop", "logo", "video", "trailer").prefetch_related(
            "genres", "video__subtitles", "trailer__subtitles"
        )

    def get_serializer_class(self):
        return s.TitleAdminListSerializer if self.action == "list" else s.TitleAdminSerializer

    @extend_schema(parameters=TITLE_FILTERS)
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self._audit("create", instance, {"title": instance.title})

    BOOST_FIELDS = ("boost", "boost_starts_at", "boost_ends_at")

    def perform_update(self, serializer):
        before = {f: getattr(serializer.instance, f) for f in self.BOOST_FIELDS}
        super().perform_update(serializer)
        after = {f: getattr(serializer.instance, f) for f in self.BOOST_FIELDS}
        if before != after:
            self._audit(
                "boost",
                serializer.instance,
                {
                    f: {"old": str(before[f]), "new": str(after[f])}
                    for f in self.BOOST_FIELDS
                    if before[f] != after[f]
                },
            )

    @extend_schema(request=None, responses=s.TitleAdminSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        title = self.get_object()
        blockers = services.publish_blockers(title)
        if blockers:
            raise APIError(blockers[0], "cannot_publish", 400, {"publish": " ".join(blockers)})
        services.publish(title)
        self._audit("publish", title, {"status": title.status})
        return Response(s.TitleAdminSerializer(self.get_queryset().get(pk=title.pk)).data)

    @extend_schema(request=None, responses=s.TitleAdminSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        title = self.get_object()
        title.status = Title.Status.DRAFT
        title.save(update_fields=["status", "updated_at"])
        self._audit("unpublish", title)
        return Response(s.TitleAdminSerializer(self.get_queryset().get(pk=title.pk)).data)

    @extend_schema(request=s.BulkActionSerializer, responses=s.BulkResultSerializer)
    @action(detail=False, methods=["post"])
    def bulk(self, request):
        data = s.BulkActionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        ids, verb = data.validated_data["ids"], data.validated_data["action"]
        titles = list(Title.objects.filter(pk__in=ids).select_related("video"))
        updated, skipped = [], {}
        with transaction.atomic():
            for title in titles:
                if verb == "publish":
                    blockers = services.publish_blockers(title)
                    if blockers:
                        skipped[str(title.pk)] = blockers
                        continue
                    services.publish(title)
                elif verb in ("archive", "draft"):
                    title.status = (
                        Title.Status.ARCHIVED if verb == "archive" else Title.Status.DRAFT
                    )
                    title.save(update_fields=["status", "updated_at"])
                elif verb == "set_priority":
                    title.boost = data.validated_data["boost"]
                    title.save(update_fields=["boost", "updated_at"])
                else:
                    title.is_featured = verb == "feature"
                    title.save(update_fields=["is_featured", "updated_at"])
                updated.append(title.pk)
        record(
            request.user,
            f"title.bulk_{verb}",
            None,
            target_type="catalog.title",
            target_id=",".join(map(str, updated))[:150],
            changes={
                "ids": updated,
                "skipped": skipped,
                **({"boost": data.validated_data["boost"]} if verb == "set_priority" else {}),
            },
            ip=client_ip(request),
        )
        return Response({"updated": updated, "skipped": skipped})

    @extend_schema(request=s.TrailerGenerateSerializer, responses={201: AdminVideoSerializer})
    @action(
        detail=True,
        methods=["post"],
        url_path="trailer/generate",
        throttle_classes=[throttle("security.rate_upload", per_user=True)],
    )
    def generate_trailer(self, request, pk=None):
        """Cut a range of the title's own video into a new trailer (attached once ready)."""
        title = self.get_object()
        data = s.TrailerGenerateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if v["source"] == "feature":
            if title.is_series:
                raise APIError("Pick the episode to cut the trailer from.", "invalid_source")
            source, label = title.video, "Feature"
        else:
            if not title.is_series:
                raise APIError("A movie's trailer is cut from its feature.", "invalid_source")
            episode = (
                Episode.objects.select_related("season", "video")
                .filter(pk=v["source"]["episode_id"], season__title=title)
                .first()
            )
            if episode is None:
                raise APIError("That episode isn't part of this title.", "invalid_source")
            source, label = episode.video, f"S{episode.season.number}:E{episode.number}"
        if source is None or not source.is_ready or not source.source_key:
            raise APIError("Upload and finish processing the video first.", "source_not_ready")

        start, end = round(v["start_seconds"], 3), round(v["end_seconds"], 3)
        shortest = config.get_int("trailer.min_seconds", 5)
        longest = config.get_int("trailer.max_seconds", 300)
        if end <= start:
            raise APIError("The end must be after the start.", "invalid_range")
        if end > source.duration + 0.05:
            raise APIError(
                f"The video is only {timecode(source.duration)} long — end the trailer at or "
                f"before {timecode(source.duration)}.",
                "invalid_range",
            )
        if end - start < shortest:
            raise APIError(
                f"A trailer must be at least {timecode(shortest)} long "
                f"({timecode(end - start)} selected).",
                "invalid_range",
            )
        if end - start > longest:
            raise APIError(
                f"A trailer can be at most {timecode(longest)} long "
                f"({timecode(end - start)} selected).",
                "invalid_range",
            )

        options = {
            "title_id": title.pk,
            "source": v["source"],
            "label": label,
            "fade": v["fade"],
            "audio": v["audio"],
        }
        with transaction.atomic():
            Title.objects.select_for_update().filter(pk=title.pk).first()  # one generate at a time
            if VideoAsset.objects.filter(
                kind=VideoAsset.Kind.TRAILER,
                clip_options__title_id=title.pk,
                status__in=[VideoAsset.Status.QUEUED, VideoAsset.Status.TRANSCODING],
            ).exists():
                raise APIError("A trailer is already being generated for this title.", "busy", 409)
            name = f"{title.title} — trailer {timecode(start)}–{timecode(end)}.mp4"
            asset = VideoAsset.objects.create(
                kind=VideoAsset.Kind.TRAILER,
                status=VideoAsset.Status.QUEUED,
                stage="Waiting for a worker",
                original_filename=name[-255:],
                clip_of=source,
                clip_start=start,
                clip_end=end,
                clip_options=options,
                created_by=request.user,
            )
            record(
                request.user,
                "trailer.generate",
                title,
                changes={
                    "source_asset": str(source.pk),
                    "source": label,
                    "start": start,
                    "end": end,
                    "fade": v["fade"],
                    "audio": v["audio"],
                    "asset": str(asset.pk),
                },
                ip=client_ip(request),
            )
        queue_generate(asset)
        asset.refresh_from_db()
        return Response(AdminVideoSerializer(asset).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses=s.SeasonAdminSerializer(many=True))
    @action(detail=True, methods=["get"], pagination_class=None)
    def seasons(self, request, pk=None):
        title = self.get_object()
        seasons = title.seasons.select_related("poster").prefetch_related(
            Prefetch(
                "episodes",
                queryset=Episode.objects.select_related("thumbnail", "video").prefetch_related(
                    "video__subtitles"
                ),
            )
        )
        return Response(s.SeasonAdminSerializer(seasons, many=True).data)

    @extend_schema(responses=s.RelatedAdminSerializer(many=True))
    @action(detail=True, methods=["get"], pagination_class=None)
    def related(self, request, pk=None):
        title = self.get_object()
        links = title.related_links.select_related("related__poster")
        reverse = set(RelatedTitle.objects.filter(related=title).values_list("title_id", flat=True))
        return Response(
            s.RelatedAdminSerializer(links, many=True, context={"reverse_pairs": reverse}).data
        )

    @extend_schema(request=s.RelatedAdminSerializer, responses=s.RelatedAdminSerializer)
    @related.mapping.post
    def add_related(self, request, pk=None):
        title = self.get_object()
        data = s.RelatedAdminSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        related = data.validated_data["related"]
        if related.pk == title.pk:
            raise APIError("A title can't be related to itself.", "validation_error")
        link = services.link_related(
            title, related, data.validated_data["weight"], data.validated_data["two_way"]
        )
        self._audit(
            "related_add",
            title,
            {
                "related": related.pk,
                "weight": link.weight,
                "two_way": data.validated_data["two_way"],
            },
        )
        return Response(s.RelatedAdminSerializer(link).data, status=status.HTTP_201_CREATED)


class SeasonViewSet(
    AuditedMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    audit_type = "season"
    queryset = Season.objects.select_related("poster")
    serializer_class = s.SeasonAdminSerializer

    @extend_schema(
        request=s.SeasonAdminSerializer,
        responses=s.SeasonAdminSerializer,
        parameters=[OpenApiParameter("title", int, required=True)],
    )
    def create(self, request):
        title = get_object_or_404(
            Title, pk=request.query_params.get("title"), type=Title.Type.SERIES
        )
        data = s.SeasonAdminSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        season = data.save(
            title=title,
            number=data.validated_data.get("number") or services.next_season_number(title),
        )
        self._audit("create", season, {"title": title.pk, "number": season.number})
        return Response(s.SeasonAdminSerializer(season).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=s.ReorderSerializer,
        responses={204: None},
        parameters=[OpenApiParameter("title", int, required=True)],
    )
    @action(detail=False, methods=["post"])
    def reorder(self, request):
        data = s.ReorderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        title_id = int(request.query_params.get("title", 0))
        try:
            services.renumber(Season, "title_id", title_id, data.validated_data["ids"])
        except ValueError as exc:
            raise APIError(str(exc), "validation_error") from exc
        record(
            request.user,
            "season.reorder",
            None,
            target_type="catalog.title",
            target_id=str(title_id),
            changes={"order": data.validated_data["ids"]},
            ip=client_ip(request),
        )
        return Response(status=204)

    @extend_schema(request=s.EpisodeAdminSerializer, responses=s.EpisodeAdminSerializer)
    @action(detail=True, methods=["post"])
    def episodes(self, request, pk=None):
        season = self.get_object()
        data = s.EpisodeAdminSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        episode = data.save(
            season=season,
            number=data.validated_data.get("number") or services.next_episode_number(season),
        )
        self._audit("episode_create", season, {"episode": episode.pk, "number": episode.number})
        return Response(s.EpisodeAdminSerializer(episode).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=s.ReorderSerializer, responses={204: None})
    @action(detail=True, methods=["post"], url_path="reorder-episodes")
    def reorder_episodes(self, request, pk=None):
        season = self.get_object()
        data = s.ReorderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            services.renumber(Episode, "season_id", season.pk, data.validated_data["ids"])
        except ValueError as exc:
            raise APIError(str(exc), "validation_error") from exc
        self._audit("episodes_reorder", season, {"order": data.validated_data["ids"]})
        return Response(status=204)


class EpisodeViewSet(
    AuditedMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    audit_type = "episode"
    queryset = Episode.objects.select_related("thumbnail", "video")
    serializer_class = s.EpisodeAdminSerializer


class RelatedLinkViewSet(AuditedMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    http_method_names = ["patch", "delete"]
    audit_type = "related"
    queryset = RelatedTitle.objects.select_related("related__poster")
    serializer_class = s.RelatedAdminSerializer

    @extend_schema(request=s.RelatedWeightSerializer, responses=s.RelatedAdminSerializer)
    def partial_update(self, request, *args, **kwargs):
        link = self.get_object()
        data = s.RelatedWeightSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        link.weight = data.validated_data["weight"]
        link.save(update_fields=["weight"])
        RelatedTitle.objects.filter(title_id=link.related_id, related_id=link.title_id).update(
            weight=link.weight
        )
        bump_catalog_on_commit()
        self._audit("update", link, {"weight": link.weight})
        return Response(s.RelatedAdminSerializer(link).data)

    def perform_update(self, serializer):
        link = serializer.save()
        RelatedTitle.objects.filter(title_id=link.related_id, related_id=link.title_id).update(
            weight=link.weight
        )
        bump_catalog_on_commit()
        self._audit("update", link, {"weight": link.weight})

    @extend_schema(parameters=[OpenApiParameter("two_way", bool)], responses={204: None})
    def destroy(self, request, pk=None):
        link = self.get_object()
        two_way = request.query_params.get("two_way", "true") != "false"
        self._audit(
            "delete", link, {"title": link.title_id, "related": link.related_id, "two_way": two_way}
        )
        services.unlink_related(link, two_way)
        return Response(status=204)


class GenreViewSet(AuditedMixin, viewsets.ModelViewSet):
    audit_type = "genre"
    serializer_class = s.GenreAdminSerializer
    pagination_class = None

    def get_queryset(self):
        return (
            Genre.objects.select_related("artwork")
            .annotate(title_count=Count("titles"))
            .order_by("order", "name")
        )

    def perform_create(self, serializer):
        order = (Genre.objects.aggregate(m=Max("order"))["m"] or 0) + 1
        instance = serializer.save(order=order)
        self._audit("create", instance, {"name": instance.name})

    @extend_schema(request=s.ReorderSerializer, responses={204: None})
    @action(detail=False, methods=["post"])
    def reorder(self, request):
        data = s.ReorderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            for order, pk in enumerate(data.validated_data["ids"]):
                Genre.objects.filter(pk=pk).update(order=order)
            bump_catalog_on_commit()
        record(
            request.user,
            "genre.reorder",
            None,
            target_type="catalog.genre",
            changes={"order": data.validated_data["ids"]},
            ip=client_ip(request),
        )
        return Response(status=204)


class GenreTitlesView(APIView):
    """Studio → Categories → a category: the titles in it, and adding / removing many at once."""

    permission_classes = [StaffPermission]
    throttle_classes = [throttle("security.rate_genre_titles", per_user=True)]

    def _list(self, genre):
        titles = genre.titles.select_related("poster").order_by("-popularity", "title")
        return Response(
            {"count": titles.count(), "results": s.RelatedBriefSerializer(titles, many=True).data}
        )

    @extend_schema(responses=s.GenreTitlesSerializer, operation_id="admin_genre_titles")
    def get(self, request, pk: int):
        return self._list(get_object_or_404(Genre, pk=pk))

    @extend_schema(
        request=s.GenreTitlesChangeSerializer,
        responses=s.GenreTitlesSerializer,
        operation_id="admin_genre_titles_change",
    )
    def post(self, request, pk: int):
        genre = get_object_or_404(Genre, pk=pk)
        data = s.GenreTitlesChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        add, remove = set(data.validated_data["add"]), set(data.validated_data["remove"])
        if add & remove:
            raise APIError("A title can't be added and removed at once.", "validation_error")
        found = set(Title.objects.filter(pk__in=add | remove).values_list("pk", flat=True))
        if missing := (add | remove) - found:
            raise APIError(
                f"Unknown title{'s' if len(missing) > 1 else ''}: "
                + ", ".join(str(m) for m in sorted(missing)),
                "validation_error",
            )
        with transaction.atomic():
            current = set(genre.titles.values_list("pk", flat=True))
            added, removed = sorted(add - current), sorted(remove & current)
            if added:
                genre.titles.add(*added)
            if removed:
                genre.titles.remove(*removed)
            if added or removed:
                bump_catalog_on_commit()  # the m2m signal bumps too; explicit for any path
                record(
                    request.user,
                    "genre.titles",
                    genre,
                    changes={"added": added, "removed": removed},
                    ip=client_ip(request),
                )
        return self._list(genre)


class OrderedViewSet(AuditedMixin, viewsets.ModelViewSet):
    """CRUD + drag reorder for home rows and billboards."""

    pagination_class = None

    def perform_create(self, serializer):
        model = serializer.Meta.model
        order = (model.objects.aggregate(m=Max("order"))["m"] or 0) + 1
        instance = serializer.save(order=order)
        self._audit("create", instance, {"created": str(instance)})

    @extend_schema(request=s.ReorderSerializer, responses={204: None})
    @action(detail=False, methods=["post"])
    def reorder(self, request):
        data = s.ReorderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        model = self.get_queryset().model
        with transaction.atomic():
            for order, pk in enumerate(data.validated_data["ids"]):
                model.objects.filter(pk=pk).update(order=order)
            bump_catalog_on_commit()
        record(
            request.user,
            f"{self.audit_type}.reorder",
            None,
            target_type=model._meta.label_lower,
            changes={"order": data.validated_data["ids"]},
            ip=client_ip(request),
        )
        return Response(status=204)


class HomeRowViewSet(OrderedViewSet):
    audit_type = "home_row"
    serializer_class = s.HomeRowAdminSerializer
    queryset = HomeRow.objects.select_related("collection", "genre")


class BillboardViewSet(OrderedViewSet):
    audit_type = "billboard"
    serializer_class = s.BillboardAdminSerializer
    queryset = Billboard.objects.select_related("title__poster")


class CollectionViewSet(AuditedMixin, viewsets.ModelViewSet):
    audit_type = "collection"
    serializer_class = s.CollectionAdminSerializer
    pagination_class = None
    queryset = Collection.objects.prefetch_related("items__title__poster")


class ImageViewSet(
    AuditedMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    audit_type = "image"
    queryset = ImageAsset.objects.all()
    serializer_class = AdminImageSerializer
    throttle_classes = [throttle("security.rate_upload", per_user=True)]
    parser_classes = [JSONParser, MultiPartParser]

    @extend_schema(
        request={"multipart/form-data": ImageUploadSerializer},
        responses={201: AdminImageSerializer},
    )
    def create(self, request):
        data = ImageUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        asset = images.ingest(
            data.validated_data["file"], data.validated_data["kind"], request.user
        )
        self._audit("upload", asset, {"kind": asset.kind})
        return Response(AdminImageSerializer(asset).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        """Changing the crop re-renders the variants under a new version (cache-busting)."""
        from django.core.cache import cache

        from apps.media.tasks import render_image

        asset = serializer.save(
            status=ImageAsset.Status.PROCESSING, version=serializer.instance.version + 1
        )
        cache.delete(f"img:{asset.id}")
        self._audit("crop", asset, {"crop": asset.crop})
        render_image.delay(str(asset.id))

    @extend_schema(request=None, responses=AdminImageSerializer)
    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        """Render again: after a failure, or when rendering looks stuck (no worker took it)."""
        from django.core.cache import cache

        from apps.media.tasks import render_image

        asset = self.get_object()
        stuck = (
            asset.status == ImageAsset.Status.PROCESSING
            and asset.created_at < timezone.now() - dt.timedelta(minutes=2)
        )
        if asset.status == ImageAsset.Status.READY or (
            asset.status == ImageAsset.Status.PROCESSING and not stuck
        ):
            raise APIError("This image is already rendered or rendering.", "conflict", 409)
        ImageAsset.objects.filter(pk=asset.pk).update(status=ImageAsset.Status.PROCESSING, error="")
        cache.delete(f"img:{asset.id}")
        self._audit("retry", asset, {"was": asset.status})
        render_image.delay(str(asset.id))
        asset.refresh_from_db()
        return Response(AdminImageSerializer(asset).data)


class TitlePickerView(APIView):
    """Lightweight title search for pickers (related titles, billboards, collections)."""

    permission_classes = [StaffPermission]

    @extend_schema(
        parameters=[OpenApiParameter("q", str), OpenApiParameter("exclude", int)],
        responses=s.RelatedBriefSerializer(many=True),
    )
    def get(self, request):
        q = request.query_params.get("q", "").strip()
        qs = Title.objects.select_related("poster")
        if q:
            qs = (
                qs.annotate(sim=TrigramSimilarity("title", q))
                .filter(Q(title__icontains=q) | Q(sim__gt=0.2))
                .order_by("-sim")
            )
        else:
            qs = qs.order_by("-updated_at")
        if exclude := request.query_params.get("exclude"):
            qs = qs.exclude(pk=exclude)
        return Response(s.RelatedBriefSerializer(qs[:20], many=True).data)
