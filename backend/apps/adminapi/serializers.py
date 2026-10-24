from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import (
    Billboard,
    Collection,
    CollectionItem,
    Episode,
    Genre,
    HomeRow,
    RelatedTitle,
    Season,
    Title,
)
from apps.core.config import config
from apps.media.models import ImageAsset, VideoAsset
from apps.media.serializers import AdminImageSerializer, AdminVideoSerializer, TrailerSourceField


class ImageIdField(serializers.PrimaryKeyRelatedField):
    def __init__(self, kind: str | None = None, **kwargs):
        self.kind = kind
        kwargs.setdefault("queryset", ImageAsset.objects.all())
        kwargs.setdefault("allow_null", True)
        kwargs.setdefault("required", False)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        image = super().to_internal_value(data)
        if image is not None and self.kind and image.kind != self.kind:
            raise serializers.ValidationError(f"Use a {self.kind} image here.")
        return image


class VideoIdField(serializers.PrimaryKeyRelatedField):
    def __init__(self, **kwargs):
        kwargs.setdefault("queryset", VideoAsset.objects.all())
        kwargs.setdefault("allow_null", True)
        kwargs.setdefault("required", False)
        super().__init__(**kwargs)


class GenreAdminSerializer(serializers.ModelSerializer):
    artwork_id = ImageIdField(kind="artwork", source="artwork")
    artwork = AdminImageSerializer(read_only=True)
    title_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Genre
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "order",
            "show_on_home",
            "is_active",
            "artwork",
            "artwork_id",
            "title_count",
        ]
        read_only_fields = ["order"]
        extra_kwargs = {"slug": {"required": False}}

    def validate(self, attrs):
        if not attrs.get("slug") and attrs.get("name"):
            from django.utils.text import slugify

            attrs["slug"] = slugify(attrs["name"])
        return attrs


class GenreBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ["id", "name", "slug"]


class TitleAdminListSerializer(serializers.ModelSerializer):
    poster = AdminImageSerializer(read_only=True)
    effective_boost = serializers.SerializerMethodField()

    def get_effective_boost(self, obj) -> int:
        return obj.effective_boost()

    genres = GenreBriefSerializer(many=True, read_only=True)
    video_status = serializers.CharField(source="video.status", read_only=True, default=None)
    season_count = serializers.IntegerField(read_only=True)
    episode_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Title
        fields = [
            "id",
            "slug",
            "title",
            "type",
            "status",
            "translation_status",
            "year",
            "maturity_rating",
            "is_featured",
            "boost",
            "boost_starts_at",
            "boost_ends_at",
            "effective_boost",
            "poster",
            "genres",
            "video_status",
            "season_count",
            "episode_count",
            "publish_at",
            "published_at",
            "license_end",
            "updated_at",
        ]


class TitleAdminSerializer(serializers.ModelSerializer):
    genre_ids = serializers.PrimaryKeyRelatedField(
        source="genres", many=True, queryset=Genre.objects.all(), required=False
    )
    genres = GenreBriefSerializer(many=True, read_only=True)
    poster_id = ImageIdField(kind="poster", source="poster")
    backdrop_id = ImageIdField(kind="backdrop", source="backdrop")
    logo_id = ImageIdField(kind="logo", source="logo")
    video_id = VideoIdField(source="video")
    trailer_id = VideoIdField(source="trailer")
    poster = AdminImageSerializer(read_only=True)
    backdrop = AdminImageSerializer(read_only=True)
    logo = AdminImageSerializer(read_only=True)
    video = AdminVideoSerializer(read_only=True)
    trailer = AdminVideoSerializer(read_only=True)
    trailer_job = serializers.SerializerMethodField()
    publish_blockers = serializers.SerializerMethodField()
    is_billboard = serializers.SerializerMethodField()
    effective_boost = serializers.SerializerMethodField()

    def get_effective_boost(self, obj) -> int:
        return obj.effective_boost()

    class Meta:
        model = Title
        fields = [
            "id",
            "type",
            "slug",
            "title",
            "original_title",
            "synopsis",
            "short_synopsis",
            "year",
            "maturity_rating",
            "runtime_minutes",
            "language",
            "translation_status",
            "translator_name",
            "cast",
            "directors",
            "moods",
            "genres",
            "genre_ids",
            "poster",
            "poster_id",
            "backdrop",
            "backdrop_id",
            "logo",
            "logo_id",
            "video",
            "video_id",
            "trailer",
            "trailer_id",
            "trailer_job",
            "status",
            "publish_at",
            "published_at",
            "is_featured",
            "boost",
            "boost_starts_at",
            "boost_ends_at",
            "effective_boost",
            "rights_holder",
            "license_start",
            "license_end",
            "popularity",
            "created_at",
            "updated_at",
            "publish_blockers",
            "is_billboard",
        ]
        read_only_fields = ["status", "published_at", "popularity", "created_at", "updated_at"]
        extra_kwargs = {"slug": {"required": False}}

    @extend_schema_field(AdminVideoSerializer(allow_null=True))
    def get_trailer_job(self, obj):
        """The latest trailer being generated (or that failed) for this title, newer than the
        attached one. It replaces `trailer` only once ready."""
        jobs = VideoAsset.objects.filter(
            kind=VideoAsset.Kind.TRAILER, clip_options__title_id=obj.pk
        ).exclude(status=VideoAsset.Status.READY)
        if obj.trailer_id:
            jobs = jobs.exclude(pk=obj.trailer_id).filter(created_at__gt=obj.trailer.created_at)
        job = jobs.prefetch_related("subtitles").order_by("-created_at").first()
        return AdminVideoSerializer(job).data if job else None

    def get_publish_blockers(self, obj) -> list[str]:
        from apps.catalog.services import publish_blockers

        return publish_blockers(obj)

    def get_is_billboard(self, obj) -> bool:
        return obj.billboards.filter(is_active=True).exists()

    def validate_maturity_rating(self, value: str) -> str:
        allowed = config.get_json("content.maturity_ratings") or []
        if value and value not in allowed:
            raise serializers.ValidationError(f"Choose one of: {', '.join(allowed)}.")
        return value

    def validate_moods(self, value: list[str]) -> list[str]:
        moods = list(dict.fromkeys(m.strip() for m in value if m.strip()))
        if len(moods) > 3:
            raise serializers.ValidationError("Use at most 3 moods.")
        return moods

    def validate_slug(self, value: str) -> str:
        qs = Title.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Another title already uses this URL.")
        return value

    def validate(self, attrs):
        b_start = attrs.get("boost_starts_at", getattr(self.instance, "boost_starts_at", None))
        b_end = attrs.get("boost_ends_at", getattr(self.instance, "boost_ends_at", None))
        if b_start and b_end and b_end <= b_start:
            raise serializers.ValidationError(
                {"boost_ends_at": "The priority campaign must end after it starts."}
            )
        start = attrs.get("license_start", getattr(self.instance, "license_start", None))
        end = attrs.get("license_end", getattr(self.instance, "license_end", None))
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"license_end": "License end must be after the start."}
            )
        kind = attrs.get("type", getattr(self.instance, "type", None))
        if self.instance and "type" in attrs and attrs["type"] != self.instance.type:
            if self.instance.seasons.exists() or self.instance.video_id:
                raise serializers.ValidationError(
                    {"type": "Remove the video or seasons before changing the type."}
                )
        if kind == Title.Type.SERIES and attrs.get("video"):
            raise serializers.ValidationError(
                {"video_id": "Series play episodes — attach videos to episodes."}
            )
        status = attrs.get("translation_status", getattr(self.instance, "translation_status", None))
        if status == "not_translated":
            attrs["translator_name"] = ""  # translator credits only apply to translated titles
        return attrs

    def create(self, validated):
        from apps.catalog.services import unique_slug

        validated["slug"] = validated.get("slug") or unique_slug(validated["title"])
        return super().create(validated)


class EpisodeAdminSerializer(serializers.ModelSerializer):
    thumbnail_id = ImageIdField(kind="thumbnail", source="thumbnail")
    video_id = VideoIdField(source="video")
    thumbnail = AdminImageSerializer(read_only=True)
    video = AdminVideoSerializer(read_only=True)

    class Meta:
        model = Episode
        fields = [
            "id",
            "season",
            "number",
            "name",
            "synopsis",
            "runtime_minutes",
            "thumbnail",
            "thumbnail_id",
            "video",
            "video_id",
            "intro_start",
            "intro_end",
            "credits_start",
            "created_at",
        ]
        read_only_fields = ["season", "created_at"]
        extra_kwargs = {"number": {"required": False}}

    def validate(self, attrs):
        start = attrs.get("intro_start", getattr(self.instance, "intro_start", None))
        end = attrs.get("intro_end", getattr(self.instance, "intro_end", None))
        if start is not None and end is not None and end <= start:
            raise serializers.ValidationError({"intro_end": "Intro must end after it starts."})
        credits = attrs.get("credits_start", getattr(self.instance, "credits_start", None))
        if credits is not None and end is not None and credits <= end:
            raise serializers.ValidationError(
                {"credits_start": "Credits should start after the intro."}
            )
        return attrs


class SeasonAdminSerializer(serializers.ModelSerializer):
    poster_id = ImageIdField(kind="poster", source="poster")
    poster = AdminImageSerializer(read_only=True)
    episodes = EpisodeAdminSerializer(many=True, read_only=True)

    class Meta:
        model = Season
        fields = [
            "id",
            "title",
            "number",
            "name",
            "synopsis",
            "poster",
            "poster_id",
            "episodes",
            "created_at",
        ]
        read_only_fields = ["title", "created_at"]
        extra_kwargs = {"number": {"required": False}}


class RelatedBriefSerializer(serializers.ModelSerializer):
    poster = AdminImageSerializer(read_only=True)

    class Meta:
        model = Title
        fields = ["id", "title", "type", "year", "poster", "status", "translation_status"]


class GenreTitlesSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    results = RelatedBriefSerializer(many=True)


class GenreTitlesChangeSerializer(serializers.Serializer):
    add = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list, max_length=500
    )
    remove = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list, max_length=500
    )


class RelatedAdminSerializer(serializers.ModelSerializer):
    related = RelatedBriefSerializer(read_only=True)
    related_id = serializers.PrimaryKeyRelatedField(
        source="related", queryset=Title.objects.all(), write_only=True
    )
    two_way = serializers.BooleanField(write_only=True, required=False, default=True)
    is_two_way = serializers.SerializerMethodField()

    class Meta:
        model = RelatedTitle
        fields = ["id", "related", "related_id", "weight", "two_way", "is_two_way", "created_at"]

    def get_is_two_way(self, obj) -> bool:
        reverse = self.context.get("reverse_pairs")
        if reverse is not None:
            return obj.related_id in reverse
        return RelatedTitle.objects.filter(
            title_id=obj.related_id, related_id=obj.title_id
        ).exists()


class RelatedWeightSerializer(serializers.Serializer):
    weight = serializers.IntegerField(min_value=1, max_value=5)


class BulkActionSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), min_length=1, max_length=500)
    action = serializers.ChoiceField(
        choices=["publish", "archive", "draft", "feature", "unfeature", "set_priority"]
    )
    boost = serializers.IntegerField(min_value=-2, max_value=5, required=False)

    def validate(self, attrs):
        if attrs["action"] == "set_priority" and "boost" not in attrs:
            raise serializers.ValidationError({"boost": "Choose a priority between −2 and +5."})
        return attrs


class BulkResultSerializer(serializers.Serializer):
    updated = serializers.ListField(child=serializers.IntegerField())
    skipped = serializers.DictField(child=serializers.ListField(child=serializers.CharField()))


class ReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), min_length=1)


class CollectionItemSerializer(serializers.ModelSerializer):
    title = RelatedBriefSerializer(read_only=True)

    class Meta:
        model = CollectionItem
        fields = ["id", "title", "order"]


class CollectionAdminSerializer(serializers.ModelSerializer):
    items = CollectionItemSerializer(many=True, read_only=True)
    title_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model = Collection
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "starts_at",
            "ends_at",
            "is_active",
            "items",
            "title_ids",
            "created_at",
        ]
        extra_kwargs = {"slug": {"required": False}}

    def validate(self, attrs):
        if not attrs.get("slug") and attrs.get("name"):
            from django.utils.text import slugify

            attrs["slug"] = slugify(attrs["name"])
        return attrs

    def _save_items(self, collection, ids):
        if ids is None:
            return
        collection.items.all().delete()
        existing = set(Title.objects.filter(pk__in=ids).values_list("pk", flat=True))
        CollectionItem.objects.bulk_create(
            [
                CollectionItem(collection=collection, title_id=pk, order=i)
                for i, pk in enumerate(ids)
                if pk in existing
            ]
        )

    def create(self, validated):
        ids = validated.pop("title_ids", None)
        collection = super().create(validated)
        self._save_items(collection, ids)
        return collection

    def update(self, instance, validated):
        ids = validated.pop("title_ids", None)
        collection = super().update(instance, validated)
        self._save_items(collection, ids)
        return collection


class HomeRowAdminSerializer(serializers.ModelSerializer):
    collection_name = serializers.CharField(source="collection.name", read_only=True, default=None)
    genre_name = serializers.CharField(source="genre.name", read_only=True, default=None)

    class Meta:
        model = HomeRow
        fields = [
            "id",
            "kind",
            "title",
            "collection",
            "collection_name",
            "genre",
            "genre_name",
            "order",
            "is_active",
        ]
        read_only_fields = ["order"]

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", None))
        if kind == HomeRow.Kind.COLLECTION and not attrs.get(
            "collection", getattr(self.instance, "collection", None)
        ):
            raise serializers.ValidationError({"collection": "Pick a collection for this row."})
        if kind == HomeRow.Kind.GENRE and not attrs.get(
            "genre", getattr(self.instance, "genre", None)
        ):
            raise serializers.ValidationError({"genre": "Pick a genre for this row."})
        return attrs


class BillboardAdminSerializer(serializers.ModelSerializer):
    title_detail = RelatedBriefSerializer(source="title", read_only=True)

    class Meta:
        model = Billboard
        fields = [
            "id",
            "title",
            "title_detail",
            "headline",
            "tagline",
            "use_trailer",
            "order",
            "starts_at",
            "ends_at",
            "is_active",
        ]
        read_only_fields = ["order"]


class TrailerGenerateSerializer(serializers.Serializer):
    source = TrailerSourceField()
    start_seconds = serializers.FloatField(min_value=0)
    end_seconds = serializers.FloatField(min_value=0)
    fade = serializers.BooleanField(default=True)
    audio = serializers.BooleanField(default=True)
