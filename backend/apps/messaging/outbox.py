"""Test mode (`testing.mock_providers`): messages are kept here instead of being sent.

Readable only by superadmins in Studio (and by the end-to-end suite through that API), for one
hour. Nothing is written to logs: codes never appear in log files.
"""

from __future__ import annotations

import json
import time

from apps.core.config import config
from apps.core.redis import get_redis

TTL = 3600
KEEP = 20


def enabled() -> bool:
    return config.get_bool("testing.mock_providers", False)


def _key(kind: str, to: str) -> str:
    return f"outbox:{kind}:{to.strip().lower()}"


def push(kind: str, to: str, body: str, subject: str = "") -> str:
    ref = f"mock-{int(time.time() * 1000)}"
    r = get_redis()
    key = _key(kind, to)
    entry = {"ref": ref, "at": time.time(), "subject": subject, "body": body}
    pipe = r.pipeline()
    pipe.lpush(key, json.dumps(entry))
    pipe.ltrim(key, 0, KEEP - 1)
    pipe.expire(key, TTL)
    pipe.execute()
    return ref


def read(kind: str, to: str) -> list[dict]:
    return [json.loads(raw) for raw in get_redis().lrange(_key(kind, to), 0, KEEP - 1)]
