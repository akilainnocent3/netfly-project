"""Explainable recommendation scoring (no ML). All weights come from DB config.

Signals per title the viewer touched:
    strength = rating (love 2, like 1) + weight_watch × watch (finished 1, half 0.6, started 0.3)
    strength *= 0.5 ** (age_days / half_life)            # recency decay
Candidate score:
    weight_related × Σ strength(seed) × link.weight/5    # admin-selected related titles (strongest)
  + weight_genre   × genre affinity                      # shared genres with liked titles
  + weight_popularity × popularity (0..1)
  + weight_new / weight_featured boosts
  − dislike_penalty × (related-to-disliked + 0.3 × disliked-genre share)
Completed and disliked titles are excluded; `exploration_ratio` of slots are random.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import random
from collections import defaultdict
from dataclasses import dataclass, field

from django.db.models import Count, Max, Q, Sum
from django.utils import timezone

from apps.catalog.models import RelatedTitle, Title
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


def load_signals(user_id: int) -> Signals:
    now = timezone.now()
    signals = Signals()
    rating_strength = {Rating.Value.LOVE: 2.0, Rating.Value.LIKE: 1.0}
    rated: dict[int, tuple[float, str, dt.datetime]] = {}
    for title_id, value, at in Rating.objects.filter(user_id=user_id).values_list(
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
        WatchProgress.objects.filter(user_id=user_id)
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


def _daily_rng(user_id: int, salt: str = "") -> random.Random:
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


def candidates(mode: str) -> dict[int, Candidate]:
    out: dict[int, Candidate] = {}
    qs = visible_titles(mode).values_list(
        "pk", "popularity", "published_at", "is_featured", "genres__id"
    )
    for pk, pop, published, featured, genre in qs:
        c = out.get(pk)
        if c is None:
            c = out[pk] = Candidate(pk, set(), pop or 0.0, published, featured)
        if genre:
            c.genres.add(genre)
    return out


def score(
    user_id: int, mode: str, signals: Signals | None = None
) -> tuple[list[int], dict[int, float]]:
    """Ranked title ids for "Top picks" plus raw scores. Completed & disliked excluded."""
    signals = signals or load_signals(user_id)
    pool = candidates(mode)
    now = timezone.now()
    new_days = config.get_int("content.new_release_days", 60)
    w_new = config.get_float("recommendations.weight_new", 0.2)
    w_featured = config.get_float("recommendations.weight_featured", 0.3)
    max_pop = max((c.popularity for c in pool.values()), default=0) or 1.0

    def is_new(c: Candidate) -> bool:
        return bool(c.published_at and c.published_at >= now - dt.timedelta(days=new_days))

    excluded = signals.completed | signals.disliked
    rng = _daily_rng(user_id, mode)
    scores: dict[int, float] = {}

    if not signals.seeds:
        # Cold start: shuffled per user per day, lightly weighted to featured/new.
        for pk, c in pool.items():
            if pk in excluded:
                continue
            scores[pk] = rng.random() + w_featured * c.is_featured + w_new * is_new(c)
        if signals.disliked:
            _apply_dislikes(scores, pool, signals)
        return sorted(scores, key=scores.get, reverse=True), scores

    w_related = config.get_float("recommendations.weight_related", 3.0)
    w_genre = config.get_float("recommendations.weight_genre", 1.0)
    w_pop = config.get_float("recommendations.weight_popularity", 0.3)

    related: dict[int, float] = defaultdict(float)
    for src, dst, weight in RelatedTitle.objects.filter(
        title_id__in=list(signals.seeds)
    ).values_list("title_id", "related_id", "weight"):
        related[dst] += signals.seeds[src].strength * weight / 5

    affinity: dict[int, float] = defaultdict(float)
    for seed in signals.seeds.values():
        c = pool.get(seed.title_id)
        genres = (
            c.genres
            if c
            else set(
                Title.genres.through.objects.filter(title_id=seed.title_id).values_list(
                    "genre_id", flat=True
                )
            )
        )
        for g in genres:
            affinity[g] += seed.strength
    top_affinity = max(affinity.values(), default=0) or 1.0

    for pk, c in pool.items():
        if pk in excluded or pk in signals.seeds:
            continue
        genre_score = sum(affinity.get(g, 0) for g in c.genres) / (
            top_affinity * max(1, len(c.genres)) ** 0.5
        )
        scores[pk] = (
            w_related * related.get(pk, 0)
            + w_genre * genre_score
            + w_pop * (c.popularity / max_pop)
            + w_new * is_new(c)
            + w_featured * 0.5 * c.is_featured
            + rng.random() * 0.05  # tie-breaker, stable for the day
        )
    _apply_dislikes(scores, pool, signals)
    # Titles the viewer already started but didn't finish are low priority for discovery.
    for pk in signals.in_progress:
        if pk in scores:
            scores[pk] -= 0.5
    return sorted(scores, key=scores.get, reverse=True), scores


def _apply_dislikes(scores: dict[int, float], pool: dict[int, Candidate], signals: Signals) -> None:
    if not signals.disliked:
        return
    penalty = config.get_float("recommendations.dislike_penalty", 2.5)
    disliked_genres: dict[int, int] = defaultdict(int)
    for d in signals.disliked:
        for g in (pool[d].genres if d in pool else set()):
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


def with_exploration(
    ranked: list[int], pool_ids: list[int], user_id: int, limit: int, salt: str
) -> list[int]:
    """Mix `exploration_ratio` random titles into evenly spaced slots so rows never feel repetitive."""
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
        out.insert(min(len(out), (i + 1) * step - 1), pk)
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
    user_id: int, mode: str, signals: Signals, limit: int
) -> list[tuple[Seed, list[int]]]:
    """For the strongest recent seeds: their related titles first, then genre neighbours."""
    rows = []
    count = config.get_int("recommendations.because_you_liked_rows", 2)
    if not count:
        return rows
    pool = candidates(mode)
    excluded = signals.completed | signals.disliked | set(signals.seeds)
    seeds = sorted(
        signals.seeds.values(),
        key=lambda s: (s.reason != "watched", s.at, s.strength),
        reverse=True,
    )
    for seed in seeds[: count * 2]:
        if len(rows) >= count:
            break
        ids = [
            pk
            for pk in RelatedTitle.objects.filter(title_id=seed.title_id)
            .order_by("-weight", "id")
            .values_list("related_id", flat=True)
            if pk in pool and pk not in excluded
        ]
        seed_genres = (
            pool[seed.title_id].genres
            if seed.title_id in pool
            else set(
                Title.genres.through.objects.filter(title_id=seed.title_id).values_list(
                    "genre_id", flat=True
                )
            )
        )
        neighbours = sorted(
            (
                c
                for pk, c in pool.items()
                if pk not in excluded and pk not in ids and c.genres & seed_genres
            ),
            key=lambda c: (len(c.genres & seed_genres), c.popularity),
            reverse=True,
        )
        ids += [c.title_id for c in neighbours]
        if len(ids) >= 3:
            rows.append((seed, ids[:limit]))
    return rows


def trending_ids(mode: str, limit: int) -> list[int]:
    return list(
        visible_titles(mode)
        .order_by("-trending", "-popularity", "-published_at")
        .values_list("pk", flat=True)[:limit]
    )


def new_release_ids(mode: str, limit: int) -> list[int]:
    days = config.get_int("content.new_release_days", 60)
    qs = visible_titles(mode).order_by("-published_at")
    recent = list(
        qs.filter(published_at__gte=timezone.now() - dt.timedelta(days=days)).values_list(
            "pk", flat=True
        )[:limit]
    )
    return recent or list(qs.values_list("pk", flat=True)[:limit])


def genre_ids(
    mode: str, genre_id: int, limit: int, ranking: dict[int, float] | None = None
) -> list[int]:
    ids = list(
        visible_titles(mode)
        .filter(genres__id=genre_id)
        .order_by("-popularity", "-published_at")
        .values_list("pk", flat=True)[:200]
    )
    if ranking:
        ids.sort(key=lambda pk: ranking.get(pk, -99), reverse=True)
    return ids[:limit]
