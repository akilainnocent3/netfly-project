"""Public, crawlable catalog data for the signed-out landing page and the sitemap.

Both are cached under the catalog version, so admin edits (publish, unpublish, genres) show up
on the next request instead of after a TTL.
"""

from django.core.cache import cache
from django.db.models import Count, Max, Q
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.config import config
from apps.core.throttling import throttle
from apps.media.models import ImageAsset
from apps.recommendations.cache import catalog_version

from . import serializers as s
from .models import Genre, Title
from .queries import card_queryset

SITEMAP_LIMIT = 45_000  # one sitemap file holds 50k URLs; leave room for static pages and genres


def _cached(key: str, build, seconds: int = 300):
    ck = f"seo:{key}:{catalog_version()}"
    data = cache.get(ck)
    if data is None:
        data = build()
        cache.set(ck, data, seconds)
    return data


def _public(response: Response) -> Response:
    max_age = config.get_int("content.public_cache_seconds", 60)
    response["Cache-Control"] = f"public, max-age={max_age}, stale-while-revalidate=300"
    return response


class GenreLinkSerializer(serializers.Serializer):
    name = serializers.CharField()
    slug = serializers.CharField()


class LandingSerializer(serializers.Serializer):
    trending = s.TitleCardSerializer(many=True)
    genres = GenreLinkSerializer(many=True)


class LandingView(APIView):
    """Signed-out landing page: today's Top 10 and the genre directory (crawl paths)."""

    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_public")]

    @extend_schema(responses=LandingSerializer, operation_id="public_landing")
    def get(self, request):
        def build():
            top = list(
                card_queryset(Title.objects.published()).order_by(
                    "-trending", "-popularity", "-published_at", "pk"
                )[:10]
            )
            extras = {t.pk: {"rank": i} for i, t in enumerate(top, 1)}
            return {
                "trending": s.TitleCardSerializer(top, many=True, context={"extras": extras}).data,
                "genres": list(_genres().values("name", "slug")),
            }

        return _public(Response(_cached("landing", build)))


class SitemapTitleSerializer(serializers.Serializer):
    slug = serializers.CharField()
    type = serializers.CharField()
    updated_at = serializers.DateTimeField()
    image = serializers.CharField(allow_null=True)


class SitemapGenreSerializer(serializers.Serializer):
    slug = serializers.CharField()
    updated_at = serializers.DateTimeField(allow_null=True)


class SitemapSerializer(serializers.Serializer):
    titles = SitemapTitleSerializer(many=True)
    genres = SitemapGenreSerializer(many=True)


def _genres():
    published = Title.objects.published()
    return (
        Genre.objects.filter(is_active=True)
        .annotate(n=Count("titles", filter=Q(titles__in=published), distinct=True))
        .filter(n__gt=0)
        .order_by("order", "name")
    )


class SitemapView(APIView):
    """Every public URL's slug and last-modified time (the client renders sitemap.xml)."""

    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_public")]

    @extend_schema(responses=SitemapSerializer, operation_id="public_sitemap")
    def get(self, request):
        def build():
            titles = (
                Title.objects.published()
                .select_related("backdrop")
                .order_by("-popularity", "pk")[:SITEMAP_LIMIT]
            )
            published = Title.objects.published()
            genres = _genres().annotate(
                updated_at=Max("titles__updated_at", filter=Q(titles__in=published))
            )
            return {
                "titles": [
                    {
                        "slug": t.slug,
                        "type": t.type,
                        "updated_at": t.updated_at.isoformat(),
                        "image": (
                            t.backdrop.key
                            if t.backdrop and t.backdrop.status == ImageAsset.Status.READY
                            else None
                        ),
                    }
                    for t in titles
                ],
                "genres": [
                    {
                        "slug": g.slug,
                        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
                    }
                    for g in genres
                ],
            }

        return _public(Response(_cached("sitemap", build, 900)))


CATALOG_PAGE_SIZE = 60


class CatalogEntrySerializer(serializers.Serializer):
    slug = serializers.CharField()
    title = serializers.CharField()
    type = serializers.CharField()
    year = serializers.IntegerField(allow_null=True)
    letter = serializers.CharField()


class CatalogLetterSerializer(serializers.Serializer):
    letter = serializers.CharField()
    page = serializers.IntegerField()


class CatalogSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    pages = serializers.IntegerField()
    page_size = serializers.IntegerField()
    letters = CatalogLetterSerializer(many=True)
    results = CatalogEntrySerializer(many=True)


def _letter(title: str) -> str:
    first = title.strip()[:1].upper()
    return first if "A" <= first <= "Z" else "#"


class CatalogView(APIView):
    """Every published title A–Z, paginated: the crawlable catalogue behind /titles."""

    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_public")]

    @extend_schema(
        parameters=[OpenApiParameter("page", int, required=False)],
        responses=CatalogSerializer,
        operation_id="public_catalog",
    )
    def get(self, request):
        def build():
            rows = Title.objects.published().values("slug", "title", "type", "year")
            # "#" (digits, symbols) first, then A–Z, case-insensitively.
            entries = sorted(
                ({**r, "letter": _letter(r["title"])} for r in rows),
                key=lambda e: (e["letter"] != "#", e["title"].casefold(), e["slug"]),
            )
            return entries

        entries = _cached("catalog", build, 900)
        pages = max(1, -(-len(entries) // CATALOG_PAGE_SIZE))
        try:
            page = int(request.query_params.get("page", 1))
        except ValueError:
            page = 1
        if not 1 <= page <= pages:
            raise NotFound("No such page.")
        letters: list[dict] = []
        for i, entry in enumerate(entries):
            if not letters or letters[-1]["letter"] != entry["letter"]:
                letters.append({"letter": entry["letter"], "page": i // CATALOG_PAGE_SIZE + 1})
        start = (page - 1) * CATALOG_PAGE_SIZE
        return _public(
            Response(
                {
                    "count": len(entries),
                    "page": page,
                    "pages": pages,
                    "page_size": CATALOG_PAGE_SIZE,
                    "letters": letters,
                    "results": entries[start : start + CATALOG_PAGE_SIZE],
                }
            )
        )


class IndexNowKeyView(APIView):
    """The IndexNow key file (`/<key>.txt` on the site, rewritten here); 404 unless configured."""

    authentication_classes: list = []
    throttle_classes = [throttle("security.rate_public")]

    @extend_schema(responses={(200, "text/plain"): str}, operation_id="public_indexnow_key")
    def get(self, request, key: str):
        configured = config.get_str("seo.indexnow_key")
        if not configured or key != configured:
            raise NotFound()
        return HttpResponse(configured, content_type="text/plain; charset=utf-8")
