import datetime as dt

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.config import config
from apps.media.serializers import ImageRef

from .models import Episode, Genre, Season, Title


class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ["id", "name", "slug"]


class CardContextSerializer(serializers.Serializer):
    """Row-specific extras (Continue Watching progress, Top 10 rank…)."""

    progress = serializers.FloatField(required=False)
    label = serializers.CharField(required=False)
    episode_id = serializers.IntegerField(required=False)
    rank = serializers.IntegerField(required=False)
    other_mode = serializers.BooleanField(required=False)


# Fallback "This title is…" moods when the editor hasn't set any (first match per genre).
GENRE_MOODS = {
    "thriller": "Suspenseful",
    "crime": "Gritty",
    "horror": "Scary",
    "mystery": "Suspenseful",
    "comedy": "Witty",
    "romance": "Romantic",
    "drama": "Emotional",
    "action": "Exciting",
    "adventure": "Exciting",
    "sci-fi": "Mind-bending",
    "science fiction": "Mind-bending",
    "fantasy": "Imaginative",
    "documentary": "Thought-provoking",
    "family": "Feel-good",
    "animation": "Feel-good",
    "kids": "Feel-good",
    "music": "Uplifting",
}

BADGES = ["top10", "new_episodes", "recently_added", "leaving_soon"]


def card_badge(obj, top10: dict) -> str | None:
    """One badge per card, most important first: Top 10 → Leaving soon → New episodes → Recently added."""
    if obj.pk in top10:
        return "top10"
    now = timezone.now()
    window = dt.timedelta(days=config.get_int("content.badge_days", 14))
    if obj.license_end and now < obj.license_end <= now + window:
        return "leaving_soon"
    latest = getattr(obj, "latest_episode_at", None)
    published = obj.published_at
    if (
        obj.type == Title.Type.SERIES
        and latest
        and latest >= now - window
        and published
        and published < now - window
    ):
        return "new_episodes"
    if published and published >= now - window:
        return "recently_added"
    return None


class TitleCardSerializer(serializers.ModelSerializer):
    poster = ImageRef(read_only=True)
    backdrop = ImageRef(read_only=True)
    logo = ImageRef(read_only=True)
    genres = serializers.SerializerMethodField()
    season_count = serializers.SerializerMethodField()
    has_preview = serializers.SerializerMethodField()
    match = serializers.SerializerMethodField()
    context = serializers.SerializerMethodField()
    in_my_list = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    badge = serializers.SerializerMethodField()
    top10_rank = serializers.SerializerMethodField()
    moods = serializers.SerializerMethodField()

    class Meta:
        model = Title
        fields = [
            "id",
            "slug",
            "title",
            "type",
            "year",
            "maturity_rating",
            "runtime_minutes",
            "season_count",
            "short_synopsis",
            "translation_status",
            "translator_name",
            "poster",
            "backdrop",
            "logo",
            "genres",
            "has_preview",
            "match",
            "context",
            "in_my_list",
            "rating",
            "badge",
            "top10_rank",
            "moods",
        ]

    def _top10(self) -> dict:
        badges = self.context.get("badges") or {}
        return badges.get("top10") or {}

    @extend_schema_field(
        serializers.ChoiceField(choices=BADGES, allow_null=True)  # type: ignore[arg-type]
    )
    def get_badge(self, obj) -> str | None:
        return card_badge(obj, self._top10())

    def get_top10_rank(self, obj) -> int | None:
        return self._top10().get(obj.pk)

    def get_moods(self, obj) -> list[str]:
        if obj.moods:
            return list(obj.moods)[:3]
        out: list[str] = []
        for g in obj.genres.all():
            mood = GENRE_MOODS.get(g.name.lower())
            if mood and mood not in out:
                out.append(mood)
        return out[:3]

    def get_in_my_list(self, obj) -> bool | None:
        state = self.context.get("viewer")
        return obj.pk in state["in_list"] if state else None

    def get_rating(self, obj) -> int | None:
        state = self.context.get("viewer")
        return state["ratings"].get(obj.pk) if state else None

    def get_genres(self, obj) -> list[str]:
        return [g.name for g in obj.genres.all()][:3]

    def get_season_count(self, obj) -> int | None:
        return getattr(obj, "season_count", None) if obj.type == Title.Type.SERIES else None

    def get_has_preview(self, obj) -> bool:
        return bool(obj.trailer_id or obj.video_id or getattr(obj, "has_ready_episode", False))

    def get_match(self, obj) -> int | None:
        scores = self.context.get("match") or {}
        return scores.get(obj.pk)

    @extend_schema_field(CardContextSerializer(allow_null=True))
    def get_context(self, obj):
        extras = self.context.get("extras") or {}
        return extras.get(obj.pk)


class RowSerializer(serializers.Serializer):
    key = serializers.CharField()
    kind = serializers.CharField()
    title = serializers.CharField()
    items = TitleCardSerializer(many=True)
    seed = serializers.CharField(required=False, allow_null=True)


class HomePageSerializer(serializers.Serializer):
    rows = RowSerializer(many=True)
    next = serializers.CharField(allow_null=True)


class BillboardItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    headline = serializers.CharField(allow_blank=True)
    tagline = serializers.CharField(allow_blank=True)
    use_trailer = serializers.BooleanField()
    title = TitleCardSerializer()


class SeasonSummarySerializer(serializers.ModelSerializer):
    episode_count = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Season
        fields = ["id", "number", "name", "display_name", "episode_count"]


class EpisodeSerializer(serializers.ModelSerializer):
    thumbnail = ImageRef(read_only=True)
    progress = serializers.SerializerMethodField()
    watched = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()

    class Meta:
        model = Episode
        fields = [
            "id",
            "number",
            "name",
            "synopsis",
            "runtime_minutes",
            "thumbnail",
            "progress",
            "watched",
            "available",
        ]

    def _p(self, obj):
        return (self.context.get("progress") or {}).get(obj.pk)

    def get_progress(self, obj) -> float:
        p = self._p(obj)
        return round(p.fraction, 3) if p else 0.0

    def get_watched(self, obj) -> bool:
        p = self._p(obj)
        return bool(p and p.completed)

    def get_available(self, obj) -> bool:
        return bool(obj.video_id and obj.video.status == "ready")


class PlayTargetSerializer(serializers.Serializer):
    """What the smart Play button does."""

    action = serializers.ChoiceField(choices=["play", "resume"])
    label = serializers.CharField()
    episode_id = serializers.IntegerField(allow_null=True)
    season_number = serializers.IntegerField(allow_null=True)
    position = serializers.FloatField()
    progress = serializers.FloatField()


class ViewerStateSerializer(serializers.Serializer):
    in_my_list = serializers.BooleanField()
    rating = serializers.IntegerField(allow_null=True)
    play = PlayTargetSerializer(allow_null=True)
    last_season = serializers.IntegerField(allow_null=True)


def quality_label(video) -> str | None:
    """ "4K" / "HD" from the encoded ladder (what the viewer can actually get), else None."""
    if video is None:
        return None
    heights = [r.get("height") or 0 for r in (video.renditions or [])] or [video.source_height]
    top = max(heights)
    return "4K" if top >= 2160 else "HD" if top >= 720 else None


class TitleDetailSerializer(TitleCardSerializer):
    genres_full = GenreSerializer(source="genres", many=True, read_only=True)
    seasons = serializers.SerializerMethodField()
    quality = serializers.SerializerMethodField()

    class Meta(TitleCardSerializer.Meta):
        fields = [
            *TitleCardSerializer.Meta.fields,
            "original_title",
            "synopsis",
            "language",
            "cast",
            "directors",
            "genres_full",
            "seasons",
            "published_at",
            "quality",
        ]

    @extend_schema_field(serializers.ChoiceField(choices=["4K", "HD"], allow_null=True))
    def get_quality(self, obj):
        if obj.type != Title.Type.SERIES:
            return quality_label(obj.video if obj.video_id else None)
        episode = (
            Episode.objects.filter(season__title=obj, video__status="ready")
            .select_related("video")
            .order_by("season__number", "number")
            .first()
        )
        return quality_label(episode.video if episode else None)

    @extend_schema_field(SeasonSummarySerializer(many=True))
    def get_seasons(self, obj):
        if obj.type != Title.Type.SERIES:
            return []
        return SeasonSummarySerializer(getattr(obj, "visible_seasons", []), many=True).data


class TitlePageSerializer(serializers.Serializer):
    title = TitleDetailSerializer()
    viewer = ViewerStateSerializer(allow_null=True)
    more_like_this = TitleCardSerializer(many=True)


class GenreTileSerializer(serializers.ModelSerializer):
    """`artwork` is the editor's image once it has rendered; `sample` is a backdrop from one of
    the genre's titles whenever the artwork is missing, still rendering or failed."""

    artwork = ImageRef(read_only=True)
    title_count = serializers.IntegerField(read_only=True)
    sample = serializers.SerializerMethodField()

    class Meta:
        model = Genre
        fields = ["id", "name", "slug", "description", "artwork", "title_count", "sample"]

    @extend_schema_field(ImageRef(allow_null=True))
    def get_sample(self, obj):
        sample = self.context.get("samples", {}).get(obj.pk)
        return ImageRef().to_representation(sample) if sample else None


class GenreHeaderSerializer(GenreTileSerializer):
    """The category page header (no count: the grid pages through the titles)."""

    class Meta(GenreTileSerializer.Meta):
        fields = ["id", "name", "slug", "description", "artwork", "sample"]


class GenrePageSerializer(HomePageSerializer):
    genre = GenreHeaderSerializer()


class EpisodePageSerializer(serializers.Serializer):
    results = EpisodeSerializer(many=True)
    next = serializers.IntegerField(allow_null=True)
    season = SeasonSummarySerializer()


class PosterWallItemSerializer(serializers.Serializer):
    key = serializers.CharField()
    blur = serializers.CharField()


class UpcomingSerializer(TitleCardSerializer):
    """A Coming Soon card: when it lands and whether this viewer asked to be reminded."""

    synopsis = serializers.CharField(read_only=True)
    reminded = serializers.SerializerMethodField()

    class Meta(TitleCardSerializer.Meta):
        fields = [*TitleCardSerializer.Meta.fields, "synopsis", "publish_at", "reminded"]

    def get_reminded(self, obj) -> bool | None:
        reminded = self.context.get("reminded")
        return obj.pk in reminded if reminded is not None else None


class NewAndPopularSerializer(serializers.Serializer):
    coming_soon = UpcomingSerializer(many=True)
    everyone_watching = TitleCardSerializer(many=True)
    top10_series = TitleCardSerializer(many=True)
    top10_films = TitleCardSerializer(many=True)


class RelatedTermSerializer(serializers.Serializer):
    label = serializers.CharField()
    kind = serializers.ChoiceField(choices=["title", "genre", "person"])


class SearchResponseSerializer(serializers.Serializer):
    results = TitleCardSerializer(many=True)
    related = RelatedTermSerializer(many=True)


class SearchSuggestionsSerializer(serializers.Serializer):
    top = serializers.ListField(child=serializers.CharField())
    recent = serializers.ListField(child=serializers.CharField())
    top_titles = TitleCardSerializer(many=True)
