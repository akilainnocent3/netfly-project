"""Query helpers shared by every viewer endpoint (one place enforces visibility + translation)."""

from django.core.cache import cache
from django.db.models import Count, Max, Prefetch, Q, QuerySet

from apps.core.config import config

from .models import Genre, Title

MODES = {"translated", "not_translated", "all"}


def translation_mode(request) -> str:
    """`?translation=` → the viewer's saved preference → the configured default. Enforced server-side."""
    allow_all = config.get_bool("features.translation_filter_allow_all")
    default = config.get_str("content.default_translation_mode", "translated")
    candidates = [
        request.query_params.get("translation") if hasattr(request, "query_params") else None
    ]
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        from apps.accounts.viewer import viewer_for

        viewer = viewer_for(request)
        if viewer and viewer.profile_id:
            from apps.accounts.models import ViewerProfile

            candidates.append(
                ViewerProfile.objects.filter(pk=viewer.profile_id)
                .values_list("translation_mode", flat=True)
                .first()
            )
        candidates.append(user.translation_mode)
    candidates.append(default)
    for mode in candidates:
        if mode in MODES and (mode != "all" or allow_all):
            return mode
    return "translated"


def visible_titles(mode: str, kids: bool = False) -> QuerySet[Title]:
    qs = Title.objects.published().for_translation(mode)
    if kids:
        qs = qs.filter(maturity_rating__in=config.get_json("content.kids_ratings") or [])
    return qs


def is_kids(request) -> bool:
    from apps.accounts.viewer import viewer_for

    viewer = viewer_for(request)
    return bool(viewer and viewer.kids)


def card_queryset(qs: QuerySet[Title] | None = None) -> QuerySet[Title]:
    """Everything a TitleCard renders, in a constant number of queries."""
    qs = qs if qs is not None else Title.objects.all()
    return (
        qs.select_related("poster", "backdrop", "logo")
        .prefetch_related(
            Prefetch("genres", queryset=Genre.objects.filter(is_active=True).order_by("order"))
        )
        .annotate(
            season_count=Count("seasons", filter=Q(seasons__episodes__isnull=False), distinct=True),
            latest_episode_at=Max("seasons__episodes__created_at"),
        )
    )


def cards_by_ids(ids: list[int]) -> list[Title]:
    """Fetch cards for ids, preserving order."""
    if not ids:
        return []
    by_id = {t.pk: t for t in card_queryset(Title.objects.filter(pk__in=ids))}
    return [by_id[i] for i in ids if i in by_id]


def viewer_state(viewer_or_user, ids) -> dict | None:
    """My List membership + ratings for a page of cards: two queries, not two per card.
    Accepts a Viewer, a request, or a user (account-level scope)."""
    from apps.accounts.viewer import Viewer, viewer_for

    viewer = viewer_or_user
    if not isinstance(viewer, Viewer):
        if hasattr(viewer, "META"):
            viewer = viewer_for(viewer)
        elif getattr(viewer, "is_authenticated", False):
            viewer = Viewer(viewer.pk)
        else:
            viewer = None
    if viewer is None:
        return None
    from apps.engagement.models import MyListItem, Rating

    ids = list(ids)
    return {
        "in_list": set(
            MyListItem.objects.filter(**viewer.scope, title_id__in=ids).values_list(
                "title_id", flat=True
            )
        ),
        "ratings": dict(
            Rating.objects.filter(**viewer.scope, title_id__in=ids).values_list("title_id", "value")
        ),
    }


def badge_context(mode: str) -> dict:
    """Top 10 ranks for card badges (cached briefly, keyed by the catalog version)."""
    from apps.recommendations.cache import catalog_version

    key = f"badges:top10:{catalog_version()}:{mode}"
    ranks = cache.get(key)
    if ranks is None:
        ids = list(
            visible_titles(mode)
            .order_by("-trending", "-popularity", "-published_at", "pk")
            .values_list("pk", flat=True)[:10]
        )
        ranks = {pk: i + 1 for i, pk in enumerate(ids)} if len(ids) >= 5 else {}
        cache.set(key, ranks, 120)
    return {"top10": ranks}


def upcoming_titles(kids: bool = False) -> QuerySet[Title]:
    """Coming soon: drafts scheduled to publish within `content.upcoming_days`.
    Scheduling is the editorial "this is announced" signal; unscheduled drafts stay private."""
    import datetime as dt

    from django.utils import timezone

    now = timezone.now()
    horizon = now + dt.timedelta(days=config.get_int("content.upcoming_days", 60))
    qs = Title.objects.filter(
        status=Title.Status.DRAFT, publish_at__gt=now, publish_at__lte=horizon
    )
    if kids:
        qs = qs.filter(maturity_rating__in=config.get_json("content.kids_ratings") or [])
    return qs
