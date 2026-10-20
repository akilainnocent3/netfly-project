"""Per-user recommendation cache. A version counter per user makes
invalidation O(1): bumping it orphans every cached row for that user."""

from django.core.cache import cache


def user_version(user_id: int) -> int:
    return cache.get_or_set(f"recs:v:{user_id}", 1, None)


def invalidate_user(user_id: int) -> None:
    try:
        cache.incr(f"recs:v:{user_id}")
    except ValueError:
        cache.set(f"recs:v:{user_id}", 2, None)


def key(user_id: int, *parts: object) -> str:
    return f"recs:{user_id}:{user_version(user_id)}:" + ":".join(str(p) for p in parts)
