"""Catalog business rules shared by the admin API, tasks and seed commands."""

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.text import slugify

from apps.media.models import VideoAsset

from .models import Episode, RelatedTitle, Season, Title


def unique_slug(text: str, *, exclude_id: int | None = None) -> str:
    base = slugify(text)[:120] or "title"
    slug, n = base, 2
    qs = Title.objects.all()
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    while qs.filter(slug=slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


def has_playable_video(title: Title) -> tuple[bool, bool]:
    """(has any attached video, all attached videos ready)."""
    if title.is_series:
        statuses = list(
            Episode.objects.filter(season__title=title, video__isnull=False).values_list("video__status", flat=True)
        )
    else:
        statuses = [title.video.status] if title.video_id else []
    return bool(statuses), any(s == VideoAsset.Status.READY for s in statuses)


def publish_blockers(title: Title) -> list[str]:
    problems: list[str] = []
    now = timezone.now()
    if not title.rights_holder:
        problems.append("Add the rights holder before publishing.")
    if title.license_start and title.license_start > now and not title.publish_at:
        problems.append("The license hasn't started yet — schedule publishing for the license start.")
    if title.license_end and title.license_end <= now:
        problems.append("The license has expired.")
    if not title.poster_id or not title.backdrop_id:
        problems.append("Add a poster and a backdrop.")
    if not title.maturity_rating:
        problems.append("Choose a maturity rating.")
    has_video, _ = has_playable_video(title)
    if not has_video:
        problems.append("Upload a video first." if not title.is_series else "Add at least one episode with a video.")
    return problems


def publish(title: Title) -> Title:
    """Publish now, or move to 'processing' until a video finishes transcoding."""
    _, ready = has_playable_video(title)
    if ready:
        title.status = Title.Status.PUBLISHED
        title.published_at = title.published_at or timezone.now()
    else:
        title.status = Title.Status.PROCESSING
    title.save(update_fields=["status", "published_at", "updated_at"])
    return title


def on_video_ready(asset: VideoAsset) -> None:
    """Called when a transcode finishes: titles waiting in 'processing' go live."""
    waiting = Title.objects.filter(status=Title.Status.PROCESSING).filter(
        pk__in=list(Title.objects.filter(video=asset).values_list("pk", flat=True))
        + list(Episode.objects.filter(video=asset).values_list("season__title_id", flat=True))
    )
    for title in waiting:
        if not title.publish_at or title.publish_at <= timezone.now():
            publish(title)


@transaction.atomic
def link_related(title: Title, related: Title, weight: int, two_way: bool = True) -> RelatedTitle:
    link, _ = RelatedTitle.objects.update_or_create(title=title, related=related, defaults={"weight": weight})
    if two_way:
        RelatedTitle.objects.update_or_create(title=related, related=title, defaults={"weight": weight})
    return link


@transaction.atomic
def unlink_related(link: RelatedTitle, two_way: bool = True) -> None:
    if two_way:
        RelatedTitle.objects.filter(title_id=link.related_id, related_id=link.title_id).delete()
    link.delete()


@transaction.atomic
def renumber(model, parent_field: str, parent_id: int, ordered_ids: list[int]) -> None:
    """Renumber seasons or episodes 1..n in the given order (constraints are deferred)."""
    objs = {o.pk: o for o in model.objects.filter(**{parent_field: parent_id})}
    if set(ordered_ids) != set(objs):
        raise ValueError("Send every item exactly once.")
    for number, pk in enumerate(ordered_ids, start=1):
        model.objects.filter(pk=pk).update(number=number)


def next_episode_number(season: Season) -> int:
    return (season.episodes.aggregate(m=Max("number"))["m"] or 0) + 1


def next_season_number(title: Title) -> int:
    return (title.seasons.aggregate(m=Max("number"))["m"] or 0) + 1
