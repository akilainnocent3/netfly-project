import base64
import datetime as dt
import os

from django.contrib.postgres.search import TrigramSimilarity
from django.core.cache import cache
from django.db.models import CharField, Count, F, Func, Prefetch, Q, Value
from django.db.models.functions import Greatest
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.cache import patch_cache_control
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsViewer
from apps.core.config import config
from apps.core.throttling import throttle
from apps.engagement.models import MyListItem, Rating, SearchLog, WatchProgress
from apps.recommendations import engine, feed

from . import serializers as s
from .models import Billboard, Episode, Genre, Season, Title
from .queries import card_queryset, cards_by_ids, translation_mode, viewer_state, visible_titles

TRANSLATION = OpenApiParameter("translation", str, enum=["translated", "not_translated", "all"])
CURSOR = OpenApiParameter("cursor", str)


def _cursor(offset: int | None) -> str | None:
    return base64.urlsafe_b64encode(str(offset).encode()).decode() if offset is not None else None


def _offset(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(cursor.encode()).decode()))
    except (ValueError, UnicodeDecodeError):
        return 0


def _public_cache(response: Response) -> Response:
    patch_cache_control(
        response,
        public=True,
        max_age=config.get_int("content.public_cache_seconds", 60),
        stale_while_revalidate=300,
    )
    return response


class HomeView(APIView):
    """One page of the infinite home feed (rows of cards)."""

    permission_classes = [IsViewer]

    @extend_schema(
        parameters=[TRANSLATION, CURSOR], responses=s.HomePageSerializer, operation_id="browse_home"
    )
    def get(self, request):
        mode = translation_mode(request)
        page = _offset(request.query_params.get("cursor"))
        rows, match, more = feed.home_page(request.user.pk, mode, page)
        cards = feed.hydrate(rows)
        viewer = viewer_state(request.user, cards)
        out = []
        for row in rows:
            items = [cards[i] for i in row.ids if i in cards]
            if not items:
                continue
            row_context = {"match": match, "extras": row.extras, "viewer": viewer}
            out.append(
                {
                    "key": row.key,
                    "kind": row.kind,
                    "title": row.title,
                    "seed": row.seed,
                    "items": s.TitleCardSerializer(items, many=True, context=row_context).data,
                }
            )
        response = Response({"rows": out, "next": _cursor(page + 1) if more else None})
        response["Cache-Control"] = "private, no-store"
        return response


class BillboardView(APIView):
    authentication_classes: list = []

    @extend_schema(
        parameters=[TRANSLATION],
        responses=s.BillboardItemSerializer(many=True),
        operation_id="browse_billboard",
    )
    def get(self, request):
        mode = translation_mode(request)
        ck = f"billboard:{mode}"
        data = cache.get(ck)
        if data is None:
            now = timezone.now()
            visible = visible_titles(mode)
            items = [
                b
                for b in Billboard.objects.filter(is_active=True, title__in=visible)
                .filter(
                    Q(starts_at__isnull=True) | Q(starts_at__lte=now),
                    Q(ends_at__isnull=True) | Q(ends_at__gt=now),
                )
                .order_by("order")
                if b.title_id
            ]
            ids = [b.title_id for b in items]
            if not ids:
                ids = list(
                    visible.filter(is_featured=True, backdrop__isnull=False)
                    .order_by("-published_at")
                    .values_list("pk", flat=True)[:5]
                )
            if not ids:
                ids = list(
                    visible.filter(backdrop__isnull=False)
                    .order_by("-trending", "-published_at")
                    .values_list("pk", flat=True)[:5]
                )
            cards = {t.pk: t for t in cards_by_ids(ids)}
            meta = {b.title_id: b for b in items}
            data = [
                {
                    "id": meta[i].pk if i in meta else -i,
                    "headline": meta[i].headline if i in meta else "",
                    "tagline": (meta[i].tagline if i in meta else "") or cards[i].short_synopsis,
                    "use_trailer": meta[i].use_trailer if i in meta else True,
                    "title": s.TitleCardSerializer(cards[i]).data,
                }
                for i in ids
                if i in cards
            ]
            cache.set(ck, data, 60)
        return _public_cache(Response(data))


def _progress_by_episode(user_id: int, title: Title) -> dict[int, WatchProgress]:
    return {
        p.episode_id: p
        for p in WatchProgress.objects.filter(user_id=user_id, title=title, episode__isnull=False)
    }


def play_target(user, title: Title) -> dict | None:
    """Smart Play: 'Play S1:E1', 'Resume S2:E4', 'Play S3:E1' after finishing a season."""
    if not title.is_series:
        if not (title.video_id and title.video.status == "ready"):
            return None
        p = (
            WatchProgress.objects.filter(user=user, title=title, episode__isnull=True).first()
            if user
            else None
        )
        if p and not p.completed and p.fraction > 0.01:
            return {
                "action": "resume",
                "label": "Resume",
                "episode_id": None,
                "season_number": None,
                "position": p.position_seconds,
                "progress": round(p.fraction, 3),
            }
        return {
            "action": "play",
            "label": "Play",
            "episode_id": None,
            "season_number": None,
            "position": 0,
            "progress": 0,
        }

    playable = (
        Episode.objects.filter(season__title=title, video__status="ready")
        .select_related("season")
        .order_by("season__number", "number")
    )
    first = playable.first()
    if first is None:
        return None
    latest = (
        WatchProgress.objects.filter(user=user, title=title, episode__isnull=False)
        .select_related("episode__season")
        .order_by("-updated_at")
        .first()
        if user
        else None
    )
    if latest is None:
        return {
            "action": "play",
            "label": f"Play S{first.season.number}:E{first.number}",
            "episode_id": first.pk,
            "season_number": first.season.number,
            "position": 0,
            "progress": 0,
        }
    ep = latest.episode
    if not latest.completed:
        return {
            "action": "resume",
            "label": f"Resume S{ep.season.number}:E{ep.number}",
            "episode_id": ep.pk,
            "season_number": ep.season.number,
            "position": latest.position_seconds,
            "progress": round(latest.fraction, 3),
        }
    nxt = feed.next_episode(ep)
    if nxt is None:
        return {
            "action": "play",
            "label": f"Watch again S{first.season.number}:E{first.number}",
            "episode_id": first.pk,
            "season_number": first.season.number,
            "position": 0,
            "progress": 0,
        }
    return {
        "action": "play",
        "label": f"Play S{nxt.season.number}:E{nxt.number}",
        "episode_id": nxt.pk,
        "season_number": nxt.season.number,
        "position": 0,
        "progress": 0,
    }


def more_like_this(title: Title, mode: str, limit: int = 12) -> list[Title]:
    visible = visible_titles(mode).exclude(pk=title.pk)
    related = list(
        visible.filter(related_from__title=title)
        .order_by("-related_from__weight")
        .values_list("pk", flat=True)[:limit]
    )
    if len(related) < limit:
        genre_ids = list(title.genres.values_list("pk", flat=True))
        more = (
            visible.exclude(pk__in=related)
            .filter(genres__in=genre_ids)
            .annotate(shared=Count("genres", filter=Q(genres__in=genre_ids)))
            .order_by("-shared", "-popularity")
            .values_list("pk", flat=True)[: limit - len(related)]
        )
        related += list(dict.fromkeys(more))
    return cards_by_ids(related[:limit])


class TitlePageView(APIView):
    """Title detail for the modal / deep link. Viewer state included when signed in."""

    @extend_schema(
        parameters=[TRANSLATION], responses=s.TitlePageSerializer, operation_id="title_detail"
    )
    def get(self, request, slug: str):
        mode = translation_mode(request)
        qs = (
            card_queryset(Title.objects.published())
            .select_related("video")
            .prefetch_related(
                Prefetch(
                    "seasons",
                    queryset=Season.objects.annotate(
                        episode_count=Count("episodes", filter=Q(episodes__video__status="ready"))
                    )
                    .filter(episode_count__gt=0)
                    .order_by("number"),
                    to_attr="visible_seasons",
                )
            )
        )
        title = qs.filter(slug=slug).first()
        if title is None:
            raise NotFound("We couldn't find that title.")
        viewer = None
        user = request.user if request.user.is_authenticated else None
        if user:
            rating = (
                Rating.objects.filter(user=user, title=title)
                .values_list("value", flat=True)
                .first()
            )
            last = (
                WatchProgress.objects.filter(user=user, title=title, episode__isnull=False)
                .order_by("-updated_at")
                .values_list("episode__season__number", flat=True)
                .first()
            )
            viewer = {
                "in_my_list": MyListItem.objects.filter(user=user, title=title).exists(),
                "rating": rating,
                "play": play_target(user, title),
                "last_season": last,
            }
        similar = more_like_this(title, mode)
        data = {
            "title": s.TitleDetailSerializer(title).data,
            "viewer": viewer,
            "more_like_this": s.TitleCardSerializer(
                similar,
                many=True,
                context={"viewer": viewer_state(request.user, [t.pk for t in similar])},
            ).data,
        }
        response = Response(data)
        response["Cache-Control"] = (
            "private, max-age=0"
            if user
            else f"public, max-age={config.get_int('content.public_cache_seconds', 60)}"
        )
        return response


class EpisodesView(APIView):
    @extend_schema(
        parameters=[OpenApiParameter("offset", int), OpenApiParameter("limit", int)],
        responses=s.EpisodePageSerializer,
        operation_id="title_episodes",
    )
    def get(self, request, slug: str, number: int):
        season = get_object_or_404(
            Season.objects.annotate(
                episode_count=Count("episodes", filter=Q(episodes__video__status="ready"))
            ),
            title__slug=slug,
            title__in=Title.objects.published(),
            number=number,
        )
        offset = max(0, int(request.query_params.get("offset", 0) or 0))
        limit = min(100, max(1, int(request.query_params.get("limit", 50) or 50)))
        qs = (
            season.episodes.filter(video__status="ready")
            .select_related("thumbnail", "video")
            .order_by("number")
        )
        page = list(qs[offset : offset + limit + 1])
        progress = (
            _progress_by_episode(request.user.pk, season.title)
            if request.user.is_authenticated
            else {}
        )
        return Response(
            {
                "results": s.EpisodeSerializer(
                    page[:limit], many=True, context={"progress": progress}
                ).data,
                "next": offset + limit if len(page) > limit else None,
                "season": s.SeasonSummarySerializer(season).data,
            }
        )


class GenresView(APIView):
    authentication_classes: list = []

    @extend_schema(
        parameters=[TRANSLATION], responses=s.GenreTileSerializer(many=True), operation_id="genres"
    )
    def get(self, request):
        mode = translation_mode(request)
        visible = visible_titles(mode)
        genres = list(
            Genre.objects.filter(is_active=True)
            .select_related("artwork")
            .annotate(title_count=Count("titles", filter=Q(titles__in=visible), distinct=True))
            .filter(title_count__gt=0)
            .order_by("order", "name")
        )
        samples = {}
        for g in genres:
            if not g.artwork_id:
                t = (
                    visible.filter(genres=g, backdrop__status="ready")
                    .select_related("backdrop")
                    .order_by("-popularity")
                    .first()
                )
                if t:
                    samples[g.pk] = t.backdrop
        return _public_cache(
            Response(s.GenreTileSerializer(genres, many=True, context={"samples": samples}).data)
        )


SORTS = {"newest": ("-published_at", "-id"), "az": ("title", "id"), "year": ("-year", "-id")}


class GenreTitlesView(APIView):
    @extend_schema(
        parameters=[
            TRANSLATION,
            CURSOR,
            OpenApiParameter("sort", str, enum=["suggested", "newest", "az", "year"]),
        ],
        responses=s.HomePageSerializer,
        operation_id="genre_titles",
    )
    def get(self, request, slug: str):
        genre = get_object_or_404(Genre, slug=slug, is_active=True)
        mode = translation_mode(request)
        sort = request.query_params.get("sort", "suggested")
        size = config.get_int("content.page_size", 30)
        offset = _offset(request.query_params.get("cursor"))
        base = visible_titles(mode).filter(genres=genre)
        if sort in SORTS:
            ids = list(
                base.order_by(*SORTS[sort]).values_list("pk", flat=True)[offset : offset + size + 1]
            )
        else:
            pool = set(base.values_list("pk", flat=True))
            if request.user.is_authenticated:
                ranked, _ = engine.score(request.user.pk, mode)
                ordered = [pk for pk in ranked if pk in pool]
                ordered += sorted(pool - set(ordered))
            else:
                ordered = list(
                    base.order_by("-popularity", "-published_at").values_list("pk", flat=True)
                )
            ids = ordered[offset : offset + size + 1]
        cards = cards_by_ids(ids[:size])
        viewer = viewer_state(request.user, [c.pk for c in cards])
        return Response(
            {
                "rows": [
                    {
                        "key": f"genre:{genre.pk}",
                        "kind": "genre",
                        "title": genre.name,
                        "seed": None,
                        "items": s.TitleCardSerializer(
                            cards, many=True, context={"viewer": viewer}
                        ).data,
                    }
                ],
                "next": _cursor(offset + size) if len(ids) > size else None,
            }
        )


class SearchView(APIView):
    throttle_classes = [throttle("security.rate_search", per_user=True)]

    @extend_schema(
        parameters=[TRANSLATION, OpenApiParameter("q", str, required=True)],
        responses=s.TitleCardSerializer(many=True),
        operation_id="search",
    )
    def get(self, request):
        q = " ".join(request.query_params.get("q", "").split())[:80]
        mode = translation_mode(request)
        if len(q) < 1:
            return Response([])
        sim = Greatest(TrigramSimilarity("title", q), TrigramSimilarity("original_title", q))
        ids = list(
            visible_titles(mode)
            .annotate(
                sim=sim,
                cast_text=Func(
                    F("cast"), Value(" "), function="array_to_string", output_field=CharField()
                ),
            )
            .filter(
                Q(sim__gt=0.18)
                | Q(title__icontains=q)
                | Q(original_title__icontains=q)
                | Q(genres__name__iexact=q)
                | Q(cast_text__icontains=q)
                | Q(translator_name__icontains=q)
            )
            .order_by("-sim", "-popularity")
            .values_list("pk", flat=True)[:60]
        )
        ids = list(dict.fromkeys(ids))
        _log_search(request, q, len(ids), mode)
        return Response(
            s.TitleCardSerializer(
                cards_by_ids(ids), many=True, context={"viewer": viewer_state(request.user, ids)}
            ).data
        )


def _log_search(request, q: str, count: int, mode: str) -> None:
    """Debounced typing produces prefixes ("bre", "brea", "breaking"): keep only the latest."""
    user = request.user if request.user.is_authenticated else None
    normalized = q.lower()
    recent = (
        SearchLog.objects.filter(
            user=user, created_at__gte=timezone.now() - dt.timedelta(seconds=30)
        )
        .order_by("-created_at")
        .first()
        if user
        else None
    )
    if recent and _same_search(recent.normalized, normalized):
        recent.query, recent.normalized, recent.results, recent.translation = (
            q,
            normalized,
            count,
            mode,
        )
        recent.save(update_fields=["query", "normalized", "results", "translation"])
    else:
        SearchLog.objects.create(
            user=user, query=q, normalized=normalized, results=count, translation=mode
        )


def _same_search(a: str, b: str) -> bool:
    """Still typing (prefix) or correcting a typo (long shared prefix) → one search, not two."""
    shared = len(os.path.commonprefix([a, b]))
    return a.startswith(b) or b.startswith(a) or shared >= max(3, min(len(a), len(b)) - 2)


class SearchSuggestionsView(APIView):
    @extend_schema(
        responses={
            200: {
                "type": "object",
                "properties": {
                    "top": {"type": "array", "items": {"type": "string"}},
                    "recent": {"type": "array", "items": {"type": "string"}},
                },
            }
        },
        operation_id="search_suggestions",
    )
    def get(self, request):
        top = cache.get("search:top")
        if top is None:
            since = timezone.now() - dt.timedelta(days=7)
            top = [
                row["normalized"]
                for row in SearchLog.objects.filter(created_at__gte=since, results__gt=0)
                .values("normalized")
                .annotate(n=Count("id"))
                .order_by("-n")[:8]
            ]
            cache.set("search:top", top, 600)
        recent: list[str] = []
        if request.user.is_authenticated:
            for qtext in (
                SearchLog.objects.filter(user=request.user, results__gt=0)
                .order_by("-created_at")
                .values_list("query", flat=True)[:30]
            ):
                if qtext.lower() not in (r.lower() for r in recent):
                    recent.append(qtext)
                if len(recent) >= 8:
                    break
        return Response({"top": top, "recent": recent})


class PosterWallView(APIView):
    authentication_classes: list = []

    @extend_schema(
        responses={
            200: {
                "type": "object",
                "properties": {"results": {"type": "array", "items": {"type": "object"}}},
            }
        },
        operation_id="poster_wall",
    )
    def get(self, request):
        data = cache.get("poster-wall")
        if data is None:
            titles = (
                Title.objects.published()
                .filter(poster__status="ready")
                .select_related("poster")
                .order_by("-popularity", "-published_at")[:35]
            )
            data = [{"key": t.poster.key, "blur": t.poster.blur_data_url} for t in titles]
            cache.set("poster-wall", data, 600)
        return _public_cache(Response({"results": data}))
