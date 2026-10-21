"""Home feed: an ordered list of rows, paginated so the page can scroll forever.

Personalised rows (top picks, because-you-liked, genre rows ranked for the
viewer) are computed once and cached per user + translation mode + type; the
cache key carries the viewer's version (rating / finish / My List) and the
global catalog version (any Studio edit), so both invalidate instantly.
Disliked titles are excluded from every row except Continue Watching, and a
title may appear in at most `row_dedupe_window` rows on one page.
Continue Watching and My List are always computed live (cheap, and must
reflect progress saved seconds ago).

Signed-out visitors share one feed (`ANONYMOUS`): the same cold-start ranking,
without Continue Watching, My List, "Because you liked" or match scores, cached
once per translation mode + type under the catalog version.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from django.core.cache import cache

from apps.accounts.viewer import Viewer, as_viewer
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


# Signed-out visitors: a reserved viewer id (Postgres ids start at 1), so the cached rows are shared.
ANONYMOUS = Viewer(0)
PERSONAL_ONLY = ("continue_watching", "my_list", "because_you_liked")

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
def continue_watching(who: Viewer | int, mode: str, limit: int, kind: str | None = None) -> Row:
    viewer = as_viewer(who)
    ignores_filter = config.get_bool("features.continue_watching_ignores_filter")
    latest: dict[int, WatchProgress] = {}
    for p in (
        WatchProgress.objects.filter(**viewer.scope, hidden=False)
        .select_related("episode__season", "title")
        .order_by("-updated_at")[:200]
    ):
        latest.setdefault(p.title_id, p)
    visible_qs = visible_titles("all", viewer.kids).filter(pk__in=list(latest))
    if kind:
        visible_qs = visible_qs.filter(type=kind)
    visible = set(visible_qs.values_list("pk", "translation_status"))
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


def my_list(who: Viewer | int, mode: str, limit: int, kind: str | None = None) -> Row:
    viewer = as_viewer(who)
    titles = visible_titles(mode, viewer.kids)
    titles = titles.filter(type=kind) if kind else titles
    ids = list(
        MyListItem.objects.filter(**viewer.scope, title__in=titles)
        .order_by("-created_at")
        .values_list("title_id", flat=True)[:limit]
    )
    return Row("my_list", "my_list", "My List", ids)


# -- cached personalised rows ----------------------------------------------------------
def _layout() -> list[dict]:
    rows = list(
        HomeRow.objects.filter(is_active=True)
        .order_by("order", "id")
        .values("kind", "title", "collection_id", "genre_id")
    )
    if not rows:
        return [
            {"kind": k, "title": "", "collection_id": None, "genre_id": None}
            for k in DEFAULT_LAYOUT
        ]
    return rows


LIVE_KINDS = ("continue_watching", "my_list")
DEDUPE_EXEMPT = ("continue_watching", "my_list", "top10")
MIN_ROW = 4


class _Dedupe:
    """Caps how many rows a title appears in. A row is never shrunk below MIN_ROW items: if the cap
    would leave fewer, it is topped up with the least-shown of its original titles (small catalogs).
    """

    def __init__(self, window: int) -> None:
        self.window = window
        self.count: dict[int, int] = {}

    def apply(self, kind: str, ids: list[int]) -> list[int]:
        if kind in DEDUPE_EXEMPT:
            return ids
        kept = [i for i in ids if self.count.get(i, 0) < self.window]
        if kind == "explore":
            # Tail rows exist to show something new: never pad them with repeats (short ones are dropped).
            if len(kept) >= 3:
                for i in kept:
                    self.count[i] = self.count.get(i, 0) + 1
            return kept
        if len(kept) < min(MIN_ROW, len(ids)):
            spare = sorted(
                (i for i in ids if i not in kept),
                key=lambda i: (self.count.get(i, 0), ids.index(i)),
            )
            fill = set(spare[: min(MIN_ROW, len(ids)) - len(kept)])
            kept = [i for i in ids if i in kept or i in fill]  # keep the row's own order
        for i in kept:
            self.count[i] = self.count.get(i, 0) + 1
        return kept


def _personal_rows(who: Viewer | int, mode: str, kind: str | None = None) -> dict:
    """All non-live rows in layout order (ids only), cached per viewer + mode + type."""
    viewer = as_viewer(who)
    anonymous = viewer == ANONYMOUS
    user_id = viewer.cache_id
    ck = cache_key(user_id, "rows", mode, kind or "all")
    cached = cache.get(ck)
    if cached is not None:
        return cached
    limit = _limit()
    signals = engine.load_signals(viewer)
    pool = engine.candidates(mode, kind, viewer.kids)
    disliked = signals.disliked
    ranked, scores = engine.score(viewer, mode, signals, pool=pool)
    personal = bool(signals.seeds)
    match = engine.to_match(scores, ranked) if personal else {}
    seen = signals.completed | signals.in_progress | set(signals.seeds) | disliked
    dedupe = _Dedupe(config.get_int("recommendations.row_dedupe_window", 3))
    out: list[dict] = []
    shown_genres: set[int] = set()
    genre_names = dict(Genre.objects.filter(is_active=True).values_list("pk", "name"))

    def add(row: Row) -> None:
        if row.kind in LIVE_KINDS:
            out.append(asdict(row))
            return
        row.ids = dedupe.apply(row.kind, [i for i in row.ids if i not in disliked])
        if row.ids and (row.kind != "explore" or len(row.ids) >= 3):
            out.append(asdict(row))

    def top_picks() -> list[int]:
        pinned = engine.pin_boosted(ranked, pool, scores, limit)
        n_pinned = sum(
            1
            for pk in pinned[: config.get_int("recommendations.boost_pin_top_picks", 2)]
            if pool[pk].boost > 0
        )
        return engine.with_exploration(
            pinned,
            [pk for pk in ranked if pk not in disliked],
            user_id,
            limit,
            "top",
            keep_first=n_pinned,
        )

    for spec in _layout():
        row_kind, heading = spec["kind"], spec.get("title") or ""
        if anonymous and row_kind in PERSONAL_ONLY:
            continue
        if row_kind in LIVE_KINDS:
            add(Row(row_kind, row_kind, heading or HomeRow.Kind(row_kind).label, []))
        elif row_kind == "because_you_liked":
            for seed, name, ids in engine.because_you_liked(user_id, mode, signals, limit, pool):
                verb = "watched" if seed.reason == "watched" else "liked"
                add(
                    Row(
                        f"byl:{seed.title_id}",
                        row_kind,
                        f"Because you {verb} {name}",
                        ids,
                        seed=name,
                    )
                )
        elif row_kind == "top_picks":
            default = (
                f"Popular on {config.get_str('branding.site_name', 'NETFLY')}"
                if anonymous
                else "Top picks for you"
            )
            add(Row("top_picks", row_kind, heading or default, top_picks()))
        elif row_kind == "trending":
            add(
                Row(
                    "trending",
                    row_kind,
                    heading or "Trending now",
                    engine.trending_ids(mode, limit, disliked, kind, viewer.kids),
                )
            )
        elif row_kind == "top10":
            if config.get_bool("features.top10_row", True):
                ids = engine.trending_ids(mode, 10, disliked, kind, viewer.kids)
                if len(ids) >= 5:
                    add(
                        Row(
                            "top10",
                            row_kind,
                            heading
                            or (
                                "Top 10 series today"
                                if kind == "series"
                                else "Top 10 films today" if kind == "movie" else "Top 10 today"
                            ),
                            ids,
                            {pk: {"rank": i + 1} for i, pk in enumerate(ids)},
                        )
                    )
        elif row_kind == "new_releases":
            add(
                Row(
                    "new_releases",
                    row_kind,
                    heading or "New releases",
                    engine.new_release_ids(pool, limit, disliked),
                )
            )
        elif row_kind in ("collection", "collections"):
            collections = (
                Collection.objects.filter(pk=spec["collection_id"])
                if row_kind == "collection"
                else Collection.objects.filter(is_active=True)
            )
            for col in collections.prefetch_related("items").order_by("name"):
                if not col.is_live():
                    continue
                ids = [i.title_id for i in col.items.all() if i.title_id in pool][:limit]
                add(
                    Row(
                        f"collection:{col.pk}",
                        "collection",
                        (row_kind == "collection" and heading) or col.name,
                        ids,
                    )
                )
        elif row_kind in ("genre", "home_genres"):
            genre_qs = (
                Genre.objects.filter(pk=spec["genre_id"])
                if row_kind == "genre"
                else Genre.objects.filter(show_on_home=True, is_active=True)
            )
            for g in genre_qs.order_by("order").values("pk", "name"):
                shown_genres.add(g["pk"])
                ids = engine.genre_ids(pool, g["pk"], limit, scores if personal else None, disliked)
                add(
                    Row(
                        f"genre:{g['pk']}",
                        "genre",
                        (row_kind == "genre" and heading) or g["name"],
                        ids,
                    )
                )

    # Endless tail: remaining genres, then rows with a real reason to exist.
    for gid, name in genre_names.items():
        if gid in shown_genres:
            continue
        ids = engine.genre_ids(pool, gid, limit, scores if personal else None, disliked)
        if len(ids) >= 3:
            add(Row(f"genre:{gid}", "genre", f"Explore {name}", ids))
    for key_, heading, ids in [
        ("hidden_gems", "Hidden gems", engine.hidden_gems(pool, seen, limit, user_id)),
        (
            "something_different",
            "Something different",
            engine.something_different(pool, signals, seen, limit),
        ),
        ("might_have_missed", "You might have missed", engine.might_have_missed(pool, seen, limit)),
    ]:
        if len(ids) >= 3:
            add(Row(key_, "explore", heading, ids))

    for row in out:
        row["extras"] = {str(k): v for k, v in row["extras"].items()}
    payload = {"rows": out, "match": {str(k): v for k, v in match.items()}}
    cache.set(ck, payload, config.get_int("recommendations.cache_seconds", 900))
    return payload


def home_page(
    user_id: Viewer | int | None, mode: str, page: int, kind: str | None = None
) -> tuple[list[Row], dict[int, int], bool]:
    """Rows for one page of the feed, plus match scores, plus whether more pages exist.
    `None` = a signed-out visitor (the shared, non-personalised feed)."""
    if user_id is None:
        user_id = ANONYMOUS
    payload = _personal_rows(user_id, mode, kind)
    per_page = config.get_int("content.home_rows_per_page", 6)
    specs = payload["rows"]
    chunk = specs[page * per_page : (page + 1) * per_page]
    limit = _limit()
    rows: list[Row] = []
    for spec in chunk:
        if spec["kind"] == "continue_watching":
            row = continue_watching(user_id, mode, limit, kind)
            row.title = spec["title"]
        elif spec["kind"] == "my_list":
            row = my_list(user_id, mode, limit, kind)
            row.title = spec["title"]
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


def billboard_ids(
    mode: str, who: Viewer | int | None, limit: int = 5, kind: str | None = None
) -> tuple[list[int], dict[int, object]]:
    """Admin billboard rows first, then effective boost, featured, trending. Viewer dislikes excluded."""
    from django.db.models import Q
    from django.utils import timezone

    from apps.catalog.models import Billboard
    from apps.engagement.models import Rating

    now = timezone.now()
    viewer = as_viewer(who) if who is not None else None
    visible = visible_titles(mode, bool(viewer and viewer.kids))
    if kind:
        visible = visible.filter(type=kind)
    disliked = (
        set(Rating.objects.filter(**viewer.scope, value=-1).values_list("title_id", flat=True))
        if viewer
        else set()
    )
    items = list(
        Billboard.objects.filter(is_active=True, title__in=visible)
        .filter(
            Q(starts_at__isnull=True) | Q(starts_at__lte=now),
            Q(ends_at__isnull=True) | Q(ends_at__gt=now),
        )
        .exclude(title_id__in=disliked)
        .order_by("order", "id")
    )
    meta = {b.title_id: b for b in items}
    ids = [b.title_id for b in items]
    if len(ids) < limit:
        pool = engine.candidates(mode, None, bool(viewer and viewer.kids))
        info = {pk: (t, b) for pk, t, b in visible.values_list("pk", "trending", "backdrop_id")}
        rest = sorted(
            (c for pk, c in pool.items() if pk in info and pk not in meta and pk not in disliked),
            # Titles with artwork first, then priority, featured, trending.
            key=lambda c: (
                info[c.title_id][1] is None,
                -c.boost,
                not c.is_featured,
                -(info[c.title_id][0] or 0),
                c.title_id,
            ),
        )
        # Only boosted/featured titles top up an admin-curated billboard; an empty one uses everything.
        if ids:
            rest = [c for c in rest if c.boost > 0 or c.is_featured]
        ids += [c.title_id for c in rest][: limit - len(ids)]
    return ids, meta
