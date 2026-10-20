from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

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
        ]

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
        return bool(obj.trailer_id or obj.video_id)

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


class TitleDetailSerializer(TitleCardSerializer):
    genres_full = GenreSerializer(source="genres", many=True, read_only=True)
    seasons = serializers.SerializerMethodField()

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
        ]

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
    artwork = ImageRef(read_only=True)
    title_count = serializers.IntegerField(read_only=True)
    sample = serializers.SerializerMethodField()

    class Meta:
        model = Genre
        fields = ["id", "name", "slug", "description", "artwork", "title_count", "sample"]

    @extend_schema_field(ImageRef(allow_null=True))
    def get_sample(self, obj):
        """Fallback artwork: a backdrop from one of the genre's titles."""
        sample = self.context.get("samples", {}).get(obj.pk)
        return ImageRef().to_representation(sample) if sample else None


class EpisodePageSerializer(serializers.Serializer):
    results = EpisodeSerializer(many=True)
    next = serializers.IntegerField(allow_null=True)
    season = SeasonSummarySerializer()


class PosterWallItemSerializer(serializers.Serializer):
    key = serializers.CharField()
    blur = serializers.CharField()
