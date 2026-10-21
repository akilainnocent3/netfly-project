from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.indexes import GinIndex
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.media.models import ImageAsset, VideoAsset


class TranslationStatus(models.TextChoices):
    TRANSLATED = "translated", "Translated"
    NOT_TRANSLATED = "not_translated", "Not translated"


class Genre(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=90, unique=True)
    description = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0, db_index=True)
    show_on_home = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    artwork = models.ForeignKey(
        ImageAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self) -> str:
        return self.name


class PublishedQuerySet(models.QuerySet):
    def published(self):
        now = timezone.now()
        return self.filter(status=Title.Status.PUBLISHED).filter(
            Q(license_end__isnull=True) | Q(license_end__gt=now)
        )

    def for_translation(self, mode: str | None):
        if mode in (TranslationStatus.TRANSLATED, TranslationStatus.NOT_TRANSLATED):
            return self.filter(translation_status=mode)
        return self


class Title(models.Model):
    class Type(models.TextChoices):
        MOVIE = "movie"
        SERIES = "series"

    class Status(models.TextChoices):
        DRAFT = "draft"
        PROCESSING = "processing"
        PUBLISHED = "published"
        ARCHIVED = "archived"

    type = models.CharField(max_length=10, choices=Type.choices)
    slug = models.SlugField(max_length=140, unique=True)
    title = models.CharField(max_length=200)
    original_title = models.CharField(max_length=200, blank=True)
    synopsis = models.TextField(blank=True)
    short_synopsis = models.CharField(max_length=300, blank=True)
    year = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1888), MaxValueValidator(2100)]
    )
    maturity_rating = models.CharField(max_length=12, blank=True)
    runtime_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    language = models.CharField(max_length=12, blank=True)
    translation_status = models.CharField(max_length=16, choices=TranslationStatus.choices)
    translator_name = models.CharField(max_length=120, blank=True)
    cast = ArrayField(models.CharField(max_length=120), default=list, blank=True)
    directors = ArrayField(models.CharField(max_length=120), default=list, blank=True)
    # "This title is…" (e.g. Suspenseful, Witty). Falls back to genre-derived moods when empty.
    moods = ArrayField(models.CharField(max_length=40), default=list, blank=True)
    genres = models.ManyToManyField(Genre, related_name="titles", blank=True)

    poster = models.ForeignKey(
        ImageAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    backdrop = models.ForeignKey(
        ImageAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    logo = models.ForeignKey(
        ImageAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    trailer = models.ForeignKey(
        VideoAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    video = models.ForeignKey(
        VideoAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    publish_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    is_featured = models.BooleanField(default=False)
    boost = models.SmallIntegerField(
        default=0,
        validators=[MinValueValidator(-2), MaxValueValidator(5)],
        help_text=(
            "Recommendation priority. 0 = normal; positive pushes the title up in every personalised row "
            "and the billboard; negative demotes it."
        ),
    )
    boost_starts_at = models.DateTimeField(null=True, blank=True)
    boost_ends_at = models.DateTimeField(null=True, blank=True)

    rights_holder = models.CharField(max_length=200, blank=True)
    license_start = models.DateTimeField(null=True, blank=True)
    license_end = models.DateTimeField(null=True, blank=True)
    license_warning_sent_at = models.DateTimeField(null=True, blank=True)

    # Denormalised, refreshed by a periodic task (apps.recommendations.tasks).
    popularity = models.FloatField(default=0)
    trending = models.FloatField(default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = PublishedQuerySet.as_manager()

    class Meta:
        ordering = ["-published_at", "-created_at"]
        indexes = [
            models.Index(fields=["status", "translation_status", "publish_at"]),
            models.Index(fields=["status", "translation_status", "-published_at"]),
            models.Index(fields=["status", "-trending"]),
            models.Index(fields=["license_end"]),
            models.Index(fields=["status", "boost"]),
            GinIndex(fields=["title"], name="title_trgm", opclasses=["gin_trgm_ops"]),
            GinIndex(
                fields=["original_title"], name="title_original_trgm", opclasses=["gin_trgm_ops"]
            ),
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def is_series(self) -> bool:
        return self.type == self.Type.SERIES

    def effective_boost(self, now=None) -> int:
        return effective_boost(self.boost, self.boost_starts_at, self.boost_ends_at, now)


def effective_boost(boost: int, starts_at, ends_at, now=None) -> int:
    """The boost in force at `now`: outside the campaign window a boost counts as 0."""
    if not boost:
        return 0
    now = now or timezone.now()
    if (starts_at and now < starts_at) or (ends_at and now >= ends_at):
        return 0
    return boost


class RelatedTitle(models.Model):
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="related_links")
    related = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="related_from")
    weight = models.PositiveSmallIntegerField(
        default=3, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-weight", "id"]
        constraints = [
            models.UniqueConstraint(fields=["title", "related"], name="related_unique_pair"),
            models.CheckConstraint(
                condition=~Q(title=models.F("related")), name="related_not_self"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title_id}->{self.related_id}"


class Season(models.Model):
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="seasons")
    number = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=120, blank=True)
    synopsis = models.TextField(blank=True)
    poster = models.ForeignKey(
        ImageAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(
                fields=["title", "number"],
                name="season_unique_number",
                deferrable=models.Deferrable.DEFERRED,
            )
        ]

    def __str__(self) -> str:
        return f"{self.title_id} S{self.number}"

    @property
    def display_name(self) -> str:
        return self.name or f"Season {self.number}"


class Episode(models.Model):
    season = models.ForeignKey(Season, on_delete=models.CASCADE, related_name="episodes")
    number = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=200)
    synopsis = models.TextField(blank=True)
    runtime_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    thumbnail = models.ForeignKey(
        ImageAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    video = models.ForeignKey(
        VideoAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    intro_start = models.FloatField(null=True, blank=True)
    intro_end = models.FloatField(null=True, blank=True)
    credits_start = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(
                fields=["season", "number"],
                name="episode_unique_number",
                deferrable=models.Deferrable.DEFERRED,
            )
        ]

    def __str__(self) -> str:
        return f"{self.season_id} E{self.number}"


class Collection(models.Model):
    """Admin-curated row ("Trending Now", "New on NETFLY"…)."""

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=130, unique=True)
    description = models.CharField(max_length=255, blank=True)
    titles = models.ManyToManyField(Title, through="CollectionItem", related_name="collections")
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def is_live(self, now=None) -> bool:
        now = now or timezone.now()
        return (
            self.is_active
            and (self.starts_at is None or self.starts_at <= now)
            and (self.ends_at is None or self.ends_at > now)
        )


class CollectionItem(models.Model):
    collection = models.ForeignKey(Collection, on_delete=models.CASCADE, related_name="items")
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="+")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["collection", "title"], name="collection_unique_title")
        ]

    def __str__(self) -> str:
        return f"{self.collection_id}:{self.title_id}"


class HomeRow(models.Model):
    """One row of the home feed layout, ordered by admins."""

    class Kind(models.TextChoices):
        CONTINUE_WATCHING = "continue_watching", "Continue Watching"
        BECAUSE_YOU_LIKED = "because_you_liked", "Because you liked…"
        TOP_PICKS = "top_picks", "Top picks for you"
        TRENDING = "trending", "Trending now"
        TOP10 = "top10", "Top 10"
        NEW_RELEASES = "new_releases", "New releases"
        MY_LIST = "my_list", "My List"
        COLLECTION = "collection", "Curated collection"
        GENRE = "genre", "Genre"
        HOME_GENRES = "home_genres", "All 'show on home' genres"

    kind = models.CharField(max_length=24, choices=Kind.choices)
    title = models.CharField(max_length=120, blank=True, help_text="Override the row heading.")
    collection = models.ForeignKey(Collection, null=True, blank=True, on_delete=models.CASCADE)
    genre = models.ForeignKey(Genre, null=True, blank=True, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0, db_index=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"{self.order}:{self.kind}"


class Billboard(models.Model):
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="billboards")
    headline = models.CharField(max_length=160, blank=True)
    tagline = models.CharField(max_length=300, blank=True)
    use_trailer = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return f"billboard:{self.title_id}"
