from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.accounts.models import ViewerProfile
from apps.catalog.models import Episode, Title


class Rating(models.Model):
    class Value(models.IntegerChoices):
        DISLIKE = -1, "Not for me"
        LIKE = 1, "I like this"
        LOVE = 2, "Love this!"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ratings"
    )
    profile = models.ForeignKey(
        ViewerProfile, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="ratings")
    value = models.SmallIntegerField(choices=Value.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "profile", "title"], name="rating_unique", nulls_distinct=False
            )
        ]
        indexes = [
            models.Index(fields=["user", "-updated_at"]),
            models.Index(fields=["title", "value"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.title_id}={self.value}"


class MyListItem(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="my_list"
    )
    profile = models.ForeignKey(
        ViewerProfile, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "profile", "title"], name="mylist_unique", nulls_distinct=False
            )
        ]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.title_id}"


class WatchProgress(models.Model):
    """Position per user × (movie title | episode). `title` is always set for fast title-level queries."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="progress"
    )
    profile = models.ForeignKey(
        ViewerProfile, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="+")
    episode = models.ForeignKey(
        Episode, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    position_seconds = models.FloatField(default=0)
    duration_seconds = models.FloatField(default=0)
    completed = models.BooleanField(default=False)
    watch_seconds = models.FloatField(default=0, help_text="Accumulated time actually watched.")
    # "Remove from row" hides the title from Continue Watching until the viewer plays it again.
    hidden = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "profile", "title"],
                condition=Q(episode__isnull=True),
                name="progress_unique_movie",
                nulls_distinct=False,
            ),
            models.UniqueConstraint(
                fields=["user", "profile", "episode"],
                condition=Q(episode__isnull=False),
                name="progress_unique_episode",
                nulls_distinct=False,
            ),
        ]
        indexes = [
            models.Index(fields=["user", "-updated_at"]),
            models.Index(fields=["user", "title", "-updated_at"]),
            models.Index(fields=["title", "completed"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.title_id}:{self.episode_id}@{self.position_seconds:.0f}"

    @property
    def fraction(self) -> float:
        return (
            min(1.0, self.position_seconds / self.duration_seconds)
            if self.duration_seconds
            else 0.0
        )


class Reminder(models.Model):
    """ "Remind me" on a Coming Soon title; surfaces as a notification once it is released."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders"
    )
    profile = models.ForeignKey(
        ViewerProfile, null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    title = models.ForeignKey(Title, on_delete=models.CASCADE, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "profile", "title"], name="reminder_unique", nulls_distinct=False
            )
        ]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.title_id}"


class ViewEvent(models.Model):
    """Append-only playback analytics. Written in batches; `created_at` makes
    range-partitioning by month a pure DDL change."""

    class Kind(models.TextChoices):
        START = "start"
        PLAY = "play"
        PAUSE = "pause"
        SEEK = "seek"
        QUALITY = "quality"
        REBUFFER = "rebuffer"
        COMPLETE = "complete"
        ERROR = "error"
        HEARTBEAT = "heartbeat"

    id = models.BigAutoField(primary_key=True)
    user_id = models.BigIntegerField(db_index=True)
    title_id = models.BigIntegerField(null=True)
    episode_id = models.BigIntegerField(null=True)
    session_id = models.CharField(max_length=40)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    position = models.FloatField(default=0)
    value = models.FloatField(null=True, help_text="startup ms, rebuffer ms, bitrate…")
    data = models.JSONField(default=dict, blank=True)
    client_ts = models.DateTimeField(null=True)
    created_at = models.DateTimeField(db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["kind", "created_at"]),
            models.Index(fields=["title_id", "created_at"]),
            models.Index(fields=["session_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.session_id}"


class SearchLog(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    query = models.CharField(max_length=120)
    normalized = models.CharField(max_length=120, db_index=True)
    results = models.PositiveIntegerField(default=0)
    translation = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self) -> str:
        return self.query
