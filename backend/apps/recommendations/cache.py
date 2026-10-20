"""Recommendation caches.

Two version counters make invalidation O(1):
* per viewer (`recs:v:<user>`) — bumped when they rate, finish or change My List;
* global catalog (`recs:catalog:v`) — bumped after any Studio write that changes what or how
  titles are recommended (publish, feature, boost, genres, related titles, collections, home
  rows, billboards). Every cached row key includes both, so stale rows are simply never read.
"""

from django.core.cache import cache
from django.db import transaction

CATALOG_KEY = "recs:catalog:v"


def user_version(user_id: int) -> int:
    return cache.get_or_set(f"recs:v:{user_id}", 1, None)


def catalog_version() -> int:
    return cache.get_or_set(CATALOG_KEY, 1, None)


def invalidate_user(user_id: int) -> None:
    try:
        cache.incr(f"recs:v:{user_id}")
    except ValueError:
        cache.set(f"recs:v:{user_id}", 2, None)


def bump_catalog() -> None:
    try:
        cache.incr(CATALOG_KEY)
    except ValueError:
        cache.set(CATALOG_KEY, 2, None)


def bump_catalog_on_commit() -> None:
    """Bump after the surrounding transaction commits (so readers never see the old data under a new version)."""
    transaction.on_commit(bump_catalog)


def key(user_id: int, *parts: object) -> str:
    return f"recs:{catalog_version()}:{user_id}:{user_version(user_id)}:" + ":".join(
        str(p) for p in parts
    )
