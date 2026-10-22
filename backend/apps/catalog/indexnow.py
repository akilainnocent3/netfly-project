"""IndexNow: tell Bing, Yandex and others right away when a title is published or unpublished.

Google ignores IndexNow (it reads the sitemap's `lastmod`, which is the title's `updated_at`).
Off unless `seo.indexnow_key` and `seo.site_url` are set. Slugs are queued in the cache and sent
in one request at most once a minute; every request is audit-logged.
"""

import logging
from urllib.parse import urlsplit

import requests
from django.core.cache import cache

from apps.core.audit import record
from apps.core.config import config

ENDPOINT = "https://api.indexnow.org/indexnow"
PENDING = "indexnow:pending"
SCHEDULED = "indexnow:scheduled"
INTERVAL = 60  # seconds between requests
MAX_URLS = 10_000  # per request (IndexNow limit)
TIMEOUT = 10

logger = logging.getLogger(__name__)


def enabled() -> bool:
    return (
        bool(config.get_str("seo.indexnow_key"))
        and bool(config.get_str("seo.site_url"))
        and config.get_bool("seo.indexing_enabled", True)
    )


def queue(slug: str) -> None:
    """Note a title whose public status changed; the next batch goes out within a minute."""
    if not enabled():
        return
    pending = cache.get(PENDING) or []
    if slug not in pending:
        cache.set(PENDING, [*pending, slug][-MAX_URLS:], None)
    if cache.add(SCHEDULED, 1, INTERVAL * 5):
        from .tasks import send_indexnow

        send_indexnow.apply_async(countdown=INTERVAL)


def send() -> dict | None:
    """Send everything queued (called by the Celery task)."""
    cache.delete(SCHEDULED)
    slugs = cache.get(PENDING) or []
    cache.delete(PENDING)
    if not slugs or not enabled():
        return None
    site = config.get_str("seo.site_url").rstrip("/")
    key = config.get_str("seo.indexnow_key")
    # The catalogue page changes with every title, so it goes along too.
    urls = [f"{site}/title/{slug}" for slug in slugs][: MAX_URLS - 1] + [f"{site}/titles"]
    body = {
        "host": urlsplit(site).hostname,
        "key": key,
        "keyLocation": f"{site}/{key}.txt",
        "urlList": urls,
    }
    try:
        response = requests.post(ENDPOINT, json=body, timeout=TIMEOUT)
        result = {"status": response.status_code, "urls": len(urls)}
    except requests.RequestException as exc:
        logger.warning("IndexNow request failed: %s", exc)
        result = {"status": None, "error": str(exc)[:200], "urls": len(urls)}
    record(
        None,
        "seo.indexnow",
        target_type="seo",
        target_id="indexnow",
        target_repr=f"IndexNow: {len(urls)} URL(s)",
        changes={**result, "sample": urls[:20]},
    )
    return result
