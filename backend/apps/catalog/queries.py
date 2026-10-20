"""Query helpers shared by every viewer endpoint (one place enforces visibility + translation)."""

from django.db.models import Count, Prefetch, Q, QuerySet

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
        candidates.append(user.translation_mode)
    candidates.append(default)
    for mode in candidates:
        if mode in MODES and (mode != "all" or allow_all):
            return mode
    return "translated"


def visible_titles(mode: str) -> QuerySet[Title]:
    return Title.objects.published().for_translation(mode)


def card_queryset(qs: QuerySet[Title] | None = None) -> QuerySet[Title]:
    """Everything a TitleCard renders, in a constant number of queries."""
    qs = qs if qs is not None else Title.objects.all()
    return (
        qs.select_related("poster", "backdrop", "logo")
        .prefetch_related(
            Prefetch("genres", queryset=Genre.objects.filter(is_active=True).order_by("order"))
        )
        .annotate(
            season_count=Count("seasons", filter=Q(seasons__episodes__isnull=False), distinct=True)
        )
    )


def cards_by_ids(ids: list[int]) -> list[Title]:
    """Fetch cards for ids, preserving order."""
    if not ids:
        return []
    by_id = {t.pk: t for t in card_queryset(Title.objects.filter(pk__in=ids))}
    return [by_id[i] for i in ids if i in by_id]


def viewer_state(user, ids) -> dict | None:
    """My List membership + ratings for a page of cards: two queries, not two per card."""
    if not getattr(user, "is_authenticated", False):
        return None
    from apps.engagement.models import MyListItem, Rating

    ids = list(ids)
    return {
        "in_list": set(
            MyListItem.objects.filter(user=user, title_id__in=ids).values_list(
                "title_id", flat=True
            )
        ),
        "ratings": dict(
            Rating.objects.filter(user=user, title_id__in=ids).values_list("title_id", "value")
        ),
    }
