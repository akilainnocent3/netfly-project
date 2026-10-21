"""Explainable recommendation scoring (no ML). All weights come from DB config.

Signals per title the viewer touched:
    strength = rating (love 2, like 1) + weight_watch × watch (finished 1, half 0.6, started 0.3)
    strength *= 0.5 ** (age_days / half_life)            # recency decay
Personalised candidate score:
    weight_related × Σ strength(seed) × link.weight/5    # admin-selected related titles (strongest)
  + weight_genre   × genre affinity                      # shared genres with liked titles
  + weight_popularity × popularity (0..1)
  + weight_new / weight_featured boosts
  + weight_boost × effective_boost                       # admin priority (−2…+5, campaign window)
  − dislike_penalty × (related-to-disliked + 0.3 × disliked-genre share)
Cold start (no signals):
    cold_start_popularity × popularity (0..1) + weight_featured × featured + weight_new × new
  + weight_boost × effective_boost + 0.35 × rng()        # rng is stable per viewer per day
Completed and disliked titles are excluded; `exploration_ratio` of slots are random; up to
`boost_pin_top_picks` positively boosted titles are pinned to the front of Top picks.
Trending and Top 10 are purely data-driven (boost never applies there).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import random
from collections import defaultdict
from dataclasses import dataclass, field

from django.db.models import Count, Max, Q, Sum
from django.utils import timezone

from apps.accounts.viewer import Viewer, as_viewer
from apps.catalog.models import RelatedTitle, Title, effective_boost
from apps.catalog.queries import visible_titles
from apps.core.config import config
from apps.engagement.models import Rating, WatchProgress


@dataclass
class Seed:
    title_id: int
    strength: float
    reason: str  # "liked" | "loved" | "watched"
    at: dt.datetime


@dataclass
class Signals:
    seeds: dict[int, Seed] = field(default_factory=dict)
    disliked: set[int] = field(default_factory=set)
    completed: set[int] = field(default_factory=set)
    in_progress: set[int] = field(default_factory=set)

    @property
    def empty(self) -> bool:
        return not self.seeds and not self.disliked


def _decay(at: dt.datetime, now: dt.datetime) -> float:
    half_life = max(1.0, config.get_float("recommendations.recency_half_life_days", 30.0))
    age = max(0.0, (now - at).total_seconds() / 86400)
    return 0.5 ** (age / half_life)


def load_signals(who: Viewer | int) -> Signals:
    viewer = as_viewer(who)
    now = timezone.now()
    signals = Signals()
    rating_strength = {Rating.Value.LOVE: 2.0, Rating.Value.LIKE: 1.0}
    rated: dict[int, tuple[float, str, dt.datetime]] = {}
    for title_id, value, at in Rating.objects.filter(**viewer.scope).values_list(
        "title_id", "value", "updated_at"
    ):
        if value == Rating.Value.DISLIKE:
            signals.disliked.add(title_id)
        else:
            rated[title_id] = (
                rating_strength[value],
                "loved" if value == Rating.Value.LOVE else "liked",
                at,
            )

    weight_watch = config.get_float("recommendations.weight_watch", 1.5)
    completed_ratio = config.get_float("playback.completed_ratio", 0.92)
    watch: dict[int, tuple[float, dt.datetime]] = {}
    rows = (
        WatchProgress.objects.filter(**viewer.scope)
        .values("title_id", "title__type")
        .annotate(
            last=Max("updated_at"),
            watched=Sum("watch_seconds"),
            duration=Sum("duration_seconds"),
            done=Count("id", filter=Q(completed=True)),
            pos=Max("position_seconds"),
        )
    )
    episode_counts = (
        dict(
            Title.objects.filter(
                pk__in=[r["title_id"] for r in rows if r["title__type"] == "series"]
            )
            .annotate(episode_count=Count("seasons__episodes"))
            .values_list("pk", "episode_count")
        )
        if rows
        else {}
    )
    for r in rows:
        title_id = r["title_id"]
        if r["title__type"] == "series":
            total = max(1, episode_counts.get(title_id, 1))
            fraction = min(1.0, (r["done"] or 0) / total)
            if (r["done"] or 0) and fraction < 0.05:
                fraction = 0.3
            finished = fraction >= completed_ratio
        else:
            fraction = min(1.0, (r["pos"] or 0) / r["duration"]) if r["duration"] else 0
            finished = bool(r["done"])
        if finished:
            signals.completed.add(title_id)
            value = 1.0
        else:
            signals.in_progress.add(title_id)
            value = 0.6 if fraction >= 0.5 else 0.3 if fraction > 0.02 else 0.0
        if value:
            watch[title_id] = (value, r["last"])

    for title_id in set(rated) | set(watch):
        if title_id in signals.disliked:
            continue
        r_strength, reason, r_at = rated.get(title_id, (0.0, "watched", None))
        w_strength, w_at = watch.get(title_id, (0.0, None))
        at = max(a for a in (r_at, w_at) if a)
        strength = (r_strength + weight_watch * w_strength) * _decay(at, now)
        if strength > 0:
            signals.seeds[title_id] = Seed(title_id, strength, reason, at)
    return signals


def _daily_rng(user_id: int | str, salt: str = "") -> random.Random:
    day = timezone.now().date().isoformat()
    digest = hashlib.sha256(f"{user_id}:{day}:{salt}".encode()).hexdigest()
    return random.Random(int(digest[:16], 16))


@dataclass
class Candidate:
    title_id: int
    genres: set[int]
    popularity: float
    published_at: dt.datetime | None
    is_featured: bool
    boost: int = 0
    type: str = ""


def candidates(mode: str, kind: str | None = None, kids: bool = False) -> dict[int, Candidate]:
    """Visible titles with what scoring needs (one query; boost already resolved for now)."""
    now = timezone.now()
    out: dict[int, Candidate] = {}
    qs = visible_titles(mode, kids)
    if kind:
        qs = qs.filter(type=kind)
    rows = qs.values_list(
        "pk",
        "popularity",
        "published_at",
        "is_featured",
        "boost",
        "boost_starts_at",
        "boost_ends_at",
        "type",
        "genres__id",
    )
    for pk, pop, published, featured, boost, b_start, b_end, ttype, genre in rows:
        c = out.get(pk)
        if c is None:
            c = out[pk] = Candidate(
                pk,
                set(),
                pop or 0.0,
                published,
                featured,
                effective_boost(boost, b_start, b_end, now),
                ttype,
            )
        if genre:
            c.genres.add(genre)
    return out


def _is_new(c: Candidate, now: dt.datetime) -> bool:
    days = config.get_int("content.new_release_days", 60)
    return bool(c.published_at and c.published_at >= now - dt.timedelta(days=days))


def score(
    user_id: Viewer | int,
    mode: str,
    signals: Signals | None = None,
    *,
    kind: str | None = None,
    pool: dict[int, Candidate] | None = None,
) -> tuple[list[int], dict[int, float]]:
    """Ranked title ids for "Top picks" plus raw scores. Completed & disliked excluded."""
    viewer = as_viewer(user_id)
    signals = signals or load_signals(viewer)
    pool = pool if pool is not None else candidates(mode, kind, viewer.kids)
    now = timezone.now()
    w_new = config.get_float("recommendations.weight_new", 0.2)
    w_featured = config.get_float("recommendations.weight_featured", 0.3)
    w_boost = config.get_float("recommendations.weight_boost", 0.6)
    max_pop = max((c.popularity for c in pool.values()), default=0) or 1.0
    excluded = signals.completed | signals.disliked
    rng = _daily_rng(viewer.cache_id, mode)
    scores: dict[int, float] = {}

    if not signals.seeds:
        w_cold_pop = config.get_float("recommendations.cold_start_popularity", 1.0)
        for pk in sorted(
            pool
        ):  # sorted: rng draws are stable for the day regardless of query order
            c = pool[pk]
            jitter = rng.random()
            if pk in excluded:
                continue
            scores[pk] = (
                w_cold_pop * (c.popularity / max_pop)
                + w_featured * c.is_featured
                + w_new * _is_new(c, now)
                + w_boost * c.boost
                + 0.35 * jitter
            )
        _apply_dislikes(scores, pool, signals)
        return sorted(scores, key=lambda k: (-scores[k], k)), scores

    w_related = config.get_float("recommendations.weight_related", 3.0)
    w_genre = config.get_float("recommendations.weight_genre", 1.0)
    w_pop = config.get_float("recommendations.weight_popularity", 0.3)

    related: dict[int, float] = defaultdict(float)
    for src, dst, weight in RelatedTitle.objects.filter(
        title_id__in=list(signals.seeds)
    ).values_list("title_id", "related_id", "weight"):
        related[dst] += signals.seeds[src].strength * weight / 5

    seed_genres = _genres_of([s for s in signals.seeds if s not in pool], pool)
    affinity: dict[int, float] = defaultdict(float)
    for seed in signals.seeds.values():
        for g in seed_genres.get(seed.title_id, set()):
            affinity[g] += seed.strength
    top_affinity = max(affinity.values(), default=0) or 1.0

    for pk in sorted(pool):
        c = pool[pk]
        jitter = rng.random()
        if pk in excluded or pk in signals.seeds:
            continue
        genre_score = sum(affinity.get(g, 0) for g in c.genres) / (
            top_affinity * max(1, len(c.genres)) ** 0.5
        )
        scores[pk] = (
            w_related * related.get(pk, 0)
            + w_genre * genre_score
            + w_pop * (c.popularity / max_pop)
            + w_new * _is_new(c, now)
            + w_featured * 0.5 * c.is_featured
            + w_boost * c.boost
            + jitter * 0.05  # tie-breaker, stable for the day
        )
    _apply_dislikes(scores, pool, signals)
    # Titles the viewer already started but didn't finish are low priority for discovery.
    for pk in signals.in_progress:
        if pk in scores:
            scores[pk] -= 0.5
    return sorted(scores, key=lambda k: (-scores[k], k)), scores


def _genres_of(missing: list[int], pool: dict[int, Candidate]) -> dict[int, set[int]]:
    """Genres for every pool title plus `missing` ids (seeds outside the current mode) in one query."""
    out = {pk: c.genres for pk, c in pool.items()}
    if missing:
        for title_id, genre_id in Title.genres.through.objects.filter(
            title_id__in=missing
        ).values_list("title_id", "genre_id"):
            out.setdefault(title_id, set()).add(genre_id)
    return out


def _apply_dislikes(scores: dict[int, float], pool: dict[int, Candidate], signals: Signals) -> None:
    if not signals.disliked:
        return
    penalty = config.get_float("recommendations.dislike_penalty", 2.5)
    disliked_genres: dict[int, int] = defaultdict(int)
    for d in signals.disliked:
        for g in pool[d].genres if d in pool else set():
            disliked_genres[g] += 1
    for _src, dst, weight in RelatedTitle.objects.filter(
        title_id__in=list(signals.disliked)
    ).values_list("title_id", "related_id", "weight"):
        if dst in scores:
            scores[dst] -= penalty * weight / 5
    for pk in scores:
        genres = pool[pk].genres if pk in pool else set()
        if genres and disliked_genres:
            share = sum(1 for g in genres if g in disliked_genres) / len(genres)
            scores[pk] -= penalty * 0.3 * share


def pin_boosted(
    ranked: list[int], pool: dict[int, Candidate], scores: dict[int, float], limit: int
) -> list[int]:
    """Guarantee up to `boost_pin_top_picks` positively boosted eligible titles the first slots."""
    slots = config.get_int("recommendations.boost_pin_top_picks", 2)
    eligible = set(scores)
    pinned = sorted(
        (pk for pk in eligible if pk in pool and pool[pk].boost > 0),
        key=lambda pk: (-pool[pk].boost, -scores.get(pk, 0), pk),
    )[:slots]
    rest = [pk for pk in ranked if pk not in pinned]
    return (pinned + rest)[:limit]


def with_exploration(
    ranked: list[int], pool_ids: list[int], user_id: int, limit: int, salt: str, keep_first: int = 0
) -> list[int]:
    """Mix `exploration_ratio` random titles into evenly spaced slots so rows never feel repetitive.
    The first `keep_first` entries (pinned titles) are never displaced."""
    ratio = config.get_float("recommendations.exploration_ratio", 0.15)
    head = ranked[:limit]
    slots = int(round(len(head) * ratio))
    if not slots:
        return head
    rng = _daily_rng(user_id, f"explore:{salt}")
    extras = [pk for pk in pool_ids if pk not in head]
    rng.shuffle(extras)
    extras = extras[:slots]
    if not extras:
        return head
    keep = head[: len(head) - len(extras)]
    step = max(2, len(head) // len(extras))
    out = list(keep)
    for i, pk in enumerate(extras):
        out.insert(max(keep_first, min(len(out), (i + 1) * step - 1)), pk)
    return out[:limit]


def to_match(scores: dict[int, float], ids: list[int]) -> dict[int, int]:
    """Map scores to a 60–98% "match" for display."""
    if not ids:
        return {}
    values = [scores.get(i, 0) for i in ids]
    hi, lo = max(values), min(values)
    span = (hi - lo) or 1.0
    return {i: int(round(60 + 38 * (scores.get(i, lo) - lo) / span)) for i in ids}


def because_you_liked(
    user_id: int, mode: str, signals: Signals, limit: int, pool: dict[int, Candidate] | None = None
) -> list[tuple[Seed, str, list[int]]]:
    """For the strongest recent seeds: their related titles first, then genre neighbours.
    Constant query count: one for related links, one for seed genres, one for seed names."""
    rows: list[tuple[Seed, str, list[int]]] = []
    count = config.get_int("recommendations.because_you_liked_rows", 2)
    if not count or not signals.seeds:
        return rows
    pool = pool if pool is not None else candidates(mode)
    excluded = signals.completed | signals.disliked | set(signals.seeds)
    seeds = sorted(
        signals.seeds.values(),
        key=lambda s: (s.reason != "watched", s.at, s.strength),
        reverse=True,
    )[: count * 2]
    seed_ids = [s.title_id for s in seeds]
    links: dict[int, list[int]] = defaultdict(list)
    for src, dst in (
        RelatedTitle.objects.filter(title_id__in=seed_ids)
        .order_by("-weight", "id")
        .values_list("title_id", "related_id")
    ):
        links[src].append(dst)
    genres = _genres_of([s for s in seed_ids if s not in pool], pool)
    names = dict(Title.objects.filter(pk__in=seed_ids).values_list("pk", "title"))
    for seed in seeds:
        if len(rows) >= count:
            break
        ids = [pk for pk in links.get(seed.title_id, []) if pk in pool and pk not in excluded]
        seed_genres = genres.get(seed.title_id, set())
        neighbours = sorted(
            (
                c
                for pk, c in pool.items()
                if pk not in excluded and pk not in ids and c.genres & seed_genres
            ),
            key=lambda c: (len(c.genres & seed_genres), c.popularity, c.title_id),
            reverse=True,
        )
        ids += [c.title_id for c in neighbours]
        if len(ids) >= 2:
            rows.append((seed, names.get(seed.title_id, ""), ids[:limit]))
    return rows


def trending_ids(
    mode: str,
    limit: int,
    exclude: set[int] = frozenset(),
    kind: str | None = None,
    kids: bool = False,
) -> list[int]:
    """Purely data-driven (no boost)."""
    qs = visible_titles(mode, kids).exclude(pk__in=exclude)
    if kind:
        qs = qs.filter(type=kind)
    return list(
        qs.order_by("-trending", "-popularity", "-published_at", "pk").values_list("pk", flat=True)[
            :limit
        ]
    )


def new_release_ids(
    pool: dict[int, Candidate], limit: int, exclude: set[int] = frozenset()
) -> list[int]:
    """Within the new-release window: boost first, then recency. Falls back to the newest overall."""
    now = timezone.now()
    eligible = [c for pk, c in pool.items() if pk not in exclude and c.published_at]
    recent = [c for c in eligible if _is_new(c, now)] or eligible
    recent.sort(key=lambda c: (-c.boost, -c.published_at.timestamp(), c.title_id))
    return [c.title_id for c in recent[:limit]]


def genre_ids(
    pool: dict[int, Candidate],
    genre_id: int,
    limit: int,
    ranking: dict[int, float] | None = None,
    exclude: set[int] = frozenset(),
) -> list[int]:
    """Personal score when available (it already includes boost); otherwise popularity + boost."""
    w_boost = config.get_float("recommendations.weight_boost", 0.6)
    max_pop = max((c.popularity for c in pool.values()), default=0) or 1.0
    members = [c for pk, c in pool.items() if genre_id in c.genres and pk not in exclude]

    def key(c: Candidate):
        if ranking and c.title_id in ranking:
            return (-ranking[c.title_id], c.title_id)
        if ranking:
            return (99.0, c.title_id)  # completed/unranked titles sink to the end
        return (
            -(c.popularity / max_pop + w_boost * c.boost),
            -(c.published_at.timestamp() if c.published_at else 0),
            c.title_id,
        )

    members.sort(key=key)
    return [c.title_id for c in members[:limit]]


def like_ratios(ids: list[int]) -> dict[int, float]:
    rows = (
        Rating.objects.filter(title_id__in=ids)
        .values("title_id")
        .annotate(likes=Count("id", filter=Q(value__gt=0)), total=Count("id"))
    )
    return {r["title_id"]: (r["likes"] + 1) / (r["total"] + 2) for r in rows}  # Laplace-smoothed


def hidden_gems(pool: dict[int, Candidate], seen: set[int], limit: int, user_id: int) -> list[int]:
    """High like-ratio, low popularity (bottom 40 %), not seen."""
    if not pool:
        return []
    pops = sorted(c.popularity for c in pool.values())
    cutoff = pops[max(0, int(len(pops) * 0.4) - 1)] if pops else 0
    low = [c for pk, c in pool.items() if c.popularity <= cutoff and pk not in seen]
    ratios = like_ratios([c.title_id for c in low])
    rng = _daily_rng(user_id, "gems")
    low.sort(key=lambda c: (-(ratios.get(c.title_id, 0.5) + 0.05 * rng.random()), c.title_id))
    return [c.title_id for c in low[:limit]]


def something_different(
    pool: dict[int, Candidate], signals: Signals, seen: set[int], limit: int
) -> list[int]:
    """Genres the viewer has NOT engaged with, ranked by popularity."""
    engaged_ids = set(signals.seeds) | signals.in_progress | signals.completed | signals.disliked
    genres = _genres_of([t for t in engaged_ids if t not in pool], pool)
    engaged: set[int] = (
        set().union(*(genres.get(t, set()) for t in engaged_ids)) if engaged_ids else set()
    )
    fresh = [
        c for pk, c in pool.items() if pk not in seen and c.genres and not (c.genres & engaged)
    ]
    fresh.sort(key=lambda c: (-c.popularity, c.title_id))
    return [c.title_id for c in fresh[:limit]]


def might_have_missed(pool: dict[int, Candidate], seen: set[int], limit: int) -> list[int]:
    """Published before the new-release window, popular, not seen."""
    now = timezone.now()
    older = [
        c for pk, c in pool.items() if pk not in seen and c.published_at and not _is_new(c, now)
    ]
    older.sort(key=lambda c: (-c.popularity, c.title_id))
    return [c.title_id for c in older[:limit]]
