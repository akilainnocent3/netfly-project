import datetime as dt
import math

from celery import shared_task
from django.db.models import Count, Q
from django.utils import timezone

from apps.catalog.models import Title
from apps.core.config import config
from apps.engagement.models import Rating, ViewEvent, WatchProgress


@shared_task
def refresh_popularity() -> int:
    """Denormalise popularity (all-time) and trending (recent window) onto Title for fast ranking."""
    window = timezone.now() - dt.timedelta(days=config.get_int("content.trending_window_days", 7))
    viewers = dict(WatchProgress.objects.values("title_id").annotate(n=Count("user_id", distinct=True)).values_list("title_id", "n"))
    recent = dict(
        WatchProgress.objects.filter(updated_at__gte=window).values("title_id").annotate(n=Count("user_id", distinct=True)).values_list("title_id", "n")
    )
    likes = dict(
        Rating.objects.values("title_id").annotate(
            n=Count("id", filter=Q(value__gt=0)) - Count("id", filter=Q(value__lt=0))
        ).values_list("title_id", "n")
    )
    recent_likes = dict(
        Rating.objects.filter(updated_at__gte=window, value__gt=0).values("title_id").annotate(n=Count("id")).values_list("title_id", "n")
    )
    plays = dict(
        ViewEvent.objects.filter(kind=ViewEvent.Kind.START, created_at__gte=window, title_id__isnull=False)
        .values("title_id").annotate(n=Count("id")).values_list("title_id", "n")
    )
    titles = list(Title.objects.only("pk", "popularity", "trending"))
    for t in titles:
        t.popularity = round(math.log1p(viewers.get(t.pk, 0)) + 0.5 * math.log1p(max(0, likes.get(t.pk, 0))), 4)
        t.trending = round(recent.get(t.pk, 0) + 0.5 * plays.get(t.pk, 0) + recent_likes.get(t.pk, 0), 4)
    Title.objects.bulk_update(titles, ["popularity", "trending"], batch_size=500)
    return len(titles)
