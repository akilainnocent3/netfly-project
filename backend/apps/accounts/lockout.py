"""Per-username login failure counter with temporary lockout (config-driven)."""

from django.core.cache import cache

from apps.core.config import config


def _key(username: str) -> str:
    return f"login-fail:{username.lower()}"


def is_locked(username: str) -> int:
    """Seconds remaining on a lock, or 0."""
    if cache.get(_key(username) + ":lock"):
        return config.get_int("auth.login_lockout_minutes", 15) * 60
    return 0


def register_failure(username: str) -> bool:
    """Returns True when this failure triggered a lock."""
    window = config.get_int("auth.login_lockout_minutes", 15) * 60
    key = _key(username)
    cache.add(key, 0, window)
    try:
        count = cache.incr(key)
    except ValueError:
        cache.set(key, 1, window)
        count = 1
    if count >= config.get_int("auth.login_max_attempts", 5):
        cache.set(key + ":lock", 1, window)
        cache.delete(key)
        return True
    return False


def clear(username: str) -> None:
    cache.delete_many([_key(username), _key(username) + ":lock"])
