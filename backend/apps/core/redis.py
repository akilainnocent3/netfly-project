"""Direct Redis access for lists/scans (the Django cache API has no list ops)."""

import redis
from django.conf import settings

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL)
    return _client
