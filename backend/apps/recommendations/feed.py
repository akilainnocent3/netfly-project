"""Home feed: an ordered list of rows, paginated so the page can scroll forever.

Personalised rows (top picks, because-you-liked, genre rows ranked for the
viewer) are computed once and cached per user + translation mode; the cache is
versioned so a rating / finish / My List change invalidates it instantly.
Continue Watching and My List are always computed live (cheap, and must
reflect progress saved seconds ago).
"""

from __future__ import annotations

import random
from dataclasses import asdict, dataclass, field

from django.core.cache import cache
from django.db.models import Max

from apps.catalog.models import Collection, Episode, Genre, HomeRow, Title
from apps.catalog.queries import cards_by_ids, visible_titles
from apps.core.config import config
from apps.engagement.models import MyListItem, WatchProgress

from . import engine
from .cache import key as cache_key


@dataclass
class Row:
    key: str
    kind: str
    title: str
    ids: list[int]
    extras: dict[int, dict] = field(default_factory=dict)
    seed: str | None = None


DEFAULT_LAYOUT = [
    "continue_watching",
    "because_you_liked",
    "top_picks",
    "trending",
    "top10",
    "new_releases",
    "collections",
    "home_genres",
    "my_list",
]


def _limit() -> int:
    return config.get_int("content.row_item_limit", 24)


# -- live rows -------------------------------------------------------------------
def continue_watching(user_id: int, mode: str, limit: int) -> Row:
    ignores_filter = config.get_bool("features.continue_watching_ignores_filter")
    latest: dict[int, WatchProgress] = {}
    for p in (
        WatchProgress.objects.filter(user_id=user_id)
        .select_related("episode__season", "title")
        .order_by("-updated_at")[:200]
    ):
        latest.setdefault(p.title_id, p)
    visible = set(
        visible_titles("all").filter(pk__in=list(latest)).values_list("pk", "translation_status")
    )
    visible_ids = {pk for pk, _ in visible}
    status_of = dict(visible)
    ids: list[int] = []
    extras: dict[int, dict] = {}
    pending_next: dict[int, WatchProgress] = {}
    for title_id, p in latest.items():
        if title_id not in visible_ids:
            continue
        other_mode = mode != "all" and status_of[title_id] != mode
        if other_mode and not ignores_filter:
            continue
        if p.episode_id is None:
            if p.completed or p.fraction < 0.01:
                continue
            extras[title_id] = {"progress": round(p.fraction, 3)}
        elif p.completed:
            pending_next[title_id] = p
            continue
        else:
            extras[title_id] = {
                "progress": round(p.fraction, 3),
                "label": f"S{p.episode.season.number}:E{p.episode.number}",
                "episode_id": p.episode_id,
            }
        if other_mode:
            extras[title_id]["other_mode"] = True
        ids.append(title_id)
    # Finished an episode → offer the next one.
    for title_id, p in pending_next.items():
        nxt = next_episode(p.episode)
        if nxt is None:
            continue
        extras[title_id] = {
            "progress": 0.0,
            "label": f"S{nxt.season.number}:E{nxt.number}",
            "episode_id": nxt.pk,
        }
        if mode != "all" and status_of[title_id] != mode:
            extras[title_id]["other_mode"] = True
        ids.append(title_id)
    order = {t: i for i, t in enumerate(latest)}
    ids.sort(key=lambda t: order[t])
    return Row("continue_watching", "continue_watching", "Continue Watching", ids[:limit], extras)


def next_episode(episode: Episode) -> Episode | None:
    nxt = (
        Episode.objects.filter(
            season=episode.season, number__gt=episode.number, video__status="ready"
        )
        .select_related("season")
        .order_by("number")
        .first()
    )
    if nxt:
        return nxt
    return (
        Episode.objects.filter(
            season__title_id=episode.season.title_id,
            season__number__gt=episode.season.number,
            video__status="ready",
        )
        .select_related("season")
        .order_by("season__number", "number")
        .first()
    )


def my_list(user_id: int, mode: str, limit: int) -> Row:
    ids = list(
        MyListItem.objects.filter(user_id=user_id, title__in=visible_titles(mode))
        .order_by("-created_at")
        .values_list("title_id", flat=True)[:limit]
    )
    return Row("my_list", "my_list", "My List", ids)


# -- cached personalised rows ----------------------------------------------------------
def _layout() -> list[dict]:
    rows = list(
        HomeRow.objects.filter(is_active=True)
        .select_related("collection", "genre")
        .order_by("order", "id")
    )
    if not rows:
        return [{"kind": k, "title": ""} for k in DEFAULT_LAYOUT]
    return [
        {"kind": r.kind, "title": r.title, "collection": r.collection_id, "genre": r.genre_id}
        for r in rows
    ]


def _personal_rows(user_id: int, mode: str) -> list[dict]:
    """All non-live rows in layout order (ids only), cached per user + mode."""
    ck = cache_key(user_id, "rows", mode)
    cached = cache.get(ck)
    if cached is not None:
        return cached
    limit = _limit()
    signals = engine.load_signals(user_id)
    ranked, scores = engine.score(user_id, mode, signals)
    match = engine.to_match(scores, ranked) if signals.seeds else {}
    pool_ids = ranked or list(visible_titles(mode).values_list("pk", flat=True))
    out: list[dict] = []
    shown_genres: set[int] = set()

    def add(row: Row) -> None:
        if row.ids or row.kind in ("continue_watching", "my_list"):
            out.append(asdict(row))

    for spec in _layout():
        kind, heading = spec["kind"], spec.get("title") or ""
        if kind in ("continue_watching", "my_list"):
            add(
                Row(kind, kind, heading or HomeRow.Kind(kind).label, [])
            )  # placeholder, filled live
        elif kind == "because_you_liked":
            for seed, ids in engine.because_you_liked(user_id, mode, signals, limit):
                name = (
                    Title.objects.filter(pk=seed.title_id).values_list("title", flat=True).first()
                    or ""
                )
                verb = "watched" if seed.reason == "watched" else "liked"
                add(Row(f"byl:{seed.title_id}", kind, f"Because you {verb} {name}", ids, seed=name))
        elif kind == "top_picks":
            add(
                Row(
                    "top_picks",
                    kind,
                    heading or "Top picks for you",
                    engine.with_exploration(ranked, pool_ids, user_id, limit, "top"),
                )
            )
        elif kind == "trending":
            add(Row("trending", kind, heading or "Trending now", engine.trending_ids(mode, limit)))
        elif kind == "top10":
            if config.get_bool("features.top10_row", True):
                ids = engine.trending_ids(mode, 10)
                if len(ids) >= 5:
                    add(
                        Row(
                            "top10",
                            kind,
                            heading or "Top 10 today",
                            ids,
                            {pk: {"rank": i + 1} for i, pk in enumerate(ids)},
                        )
                    )
        elif kind == "new_releases":
            add(
                Row(
                    "new_releases",
                    kind,
                    heading or "New releases",
                    engine.new_release_ids(mode, limit),
                )
            )
        elif kind in ("collection", "collections"):
            collections = (
                Collection.objects.filter(pk=spec["collection"])
                if kind == "collection"
                else Collection.objects.filter(is_active=True)
            )
            visible = set(visible_titles(mode).values_list("pk", flat=True))
            for col in collections.prefetch_related("items"):
                if not col.is_live():
                    continue
                ids = [i.title_id for i in col.items.all() if i.title_id in visible][:limit]
                add(
                    Row(
                        f"collection:{col.pk}",
                        "collection",
                        (kind == "collection" and heading) or col.name,
                        ids,
                    )
                )
        elif kind in ("genre", "home_genres"):
            genres = (
                Genre.objects.filter(pk=spec["genre"])
                if kind == "genre"
                else Genre.objects.filter(show_on_home=True, is_active=True)
            )
            for g in genres.order_by("order"):
                shown_genres.add(g.pk)
                ids = engine.genre_ids(mode, g.pk, limit, scores if signals.seeds else None)
                add(Row(f"genre:{g.pk}", "genre", (kind == "genre" and heading) or g.name, ids))

    # Endless tail: remaining genres, then a couple of exploration rows.
    for g in Genre.objects.filter(is_active=True).exclude(pk__in=shown_genres).order_by("order"):
        ids = engine.genre_ids(mode, g.pk, limit, scores if signals.seeds else None)
        if len(ids) >= 3:
            add(Row(f"genre:{g.pk}", "genre", f"Explore {g.name}", ids))
    rng = random.Random(f"{user_id}:{mode}")
    everything = list(pool_ids)
    for n, heading in enumerate(["Something different", "Hidden gems", "You might have missed"]):
        rng.shuffle(everything)
        if len(everything) >= 6:
            add(Row(f"explore:{n}", "explore", heading, everything[:limit]))

    for row in out:
        row["extras"] = {str(k): v for k, v in row["extras"].items()}
    payload = {"rows": out, "match": {str(k): v for k, v in match.items()}}
    cache.set(ck, payload, config.get_int("recommendations.cache_seconds", 900))
    return payload


def home_page(user_id: int, mode: str, page: int) -> tuple[list[Row], dict[int, int], bool]:
    """Rows for one page of the feed, plus match scores, plus whether more pages exist."""
    payload = _personal_rows(user_id, mode)
    per_page = config.get_int("content.home_rows_per_page", 6)
    specs = payload["rows"]
    chunk = specs[page * per_page : (page + 1) * per_page]
    limit = _limit()
    rows: list[Row] = []
    for spec in chunk:
        if spec["kind"] == "continue_watching":
            live = continue_watching(user_id, mode, limit)
            live.title = spec["title"]
            row = live
        elif spec["kind"] == "my_list":
            live = my_list(user_id, mode, limit)
            live.title = spec["title"]
            row = live
        else:
            row = Row(
                spec["key"],
                spec["kind"],
                spec["title"],
                spec["ids"],
                {int(k): v for k, v in spec["extras"].items()},
                spec.get("seed"),
            )
        if row.ids:
            rows.append(row)
    match = {int(k): v for k, v in payload["match"].items()}
    return rows, match, (page + 1) * per_page < len(specs)


def hydrate(rows: list[Row]) -> dict[int, Title]:
    """One query for every card on the page."""
    ids = list(dict.fromkeys(i for r in rows for i in r.ids))
    return {t.pk: t for t in cards_by_ids(ids)}


def latest_activity(user_id: int):
    return WatchProgress.objects.filter(user_id=user_id).aggregate(m=Max("updated_at"))["m"]
