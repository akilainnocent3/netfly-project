import datetime as dt
import hashlib
import logging

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from celery.worker.control import control_command
from django.core.cache import cache
from django.utils import timezone

from apps.core.config import config

logger = logging.getLogger(__name__)

EXTRACTION_QUEUE = "extraction"


def _consumes_extraction(consumer) -> bool:
    task_consumer = getattr(consumer, "task_consumer", None)
    return any(q.name == EXTRACTION_QUEUE for q in getattr(task_consumer, "queues", []))


@control_command()
def netfly_extraction(state) -> dict:
    """Studio asks extraction workers what they can do (Chromium for render_js, ffprobe)."""
    if not _consumes_extraction(state.consumer):
        return {"extraction": False}
    from .checks import ffprobe_path
    from .render import availability

    available, reason = availability()
    return {
        "extraction": True,
        "render_js": available,
        "render_js_reason": reason,
        "ffprobe": bool(ffprobe_path()),
    }


@shared_task(soft_time_limit=1800, time_limit=1860, acks_late=False)
def run_job(job_id: str) -> None:
    from .crawler import Crawler, effective_options
    from .fetch import user_agent
    from .models import ExtractionJob

    job = ExtractionJob.objects.filter(pk=job_id).first()
    if job is None or job.status != ExtractionJob.Status.QUEUED:
        return
    renderer = None
    if effective_options(job.options)["render_js"]:
        from .render import Renderer, availability

        available, _ = availability()
        if available:
            renderer = Renderer(user_agent())
    try:
        Crawler(job, renderer=renderer).run()
    except SoftTimeLimitExceeded:
        ExtractionJob.objects.filter(pk=job_id, status=ExtractionJob.Status.CRAWLING).update(
            status=ExtractionJob.Status.FAILED,
            error="The crawl took longer than 30 minutes and was stopped. Lower the page limit and try again.",
            finished_at=timezone.now(),
        )


def check_cache_key(url: str) -> str:
    return "extraction:check:" + hashlib.sha256(url.encode()).hexdigest()


@shared_task(soft_time_limit=120, time_limit=150, acks_late=False)
def check_link(link_id: int, force: bool = False) -> None:
    from .checks import run_check
    from .models import DiscoveredLink

    link = DiscoveredLink.objects.filter(pk=link_id).first()
    if link is None:
        return
    key = check_cache_key(link.url)
    result = None if force else cache.get(key)
    try:
        if result is None:
            result = run_check(link.url)
            cache.set(key, result, config.get_int("extraction.check_cache_seconds", 3600))
    except SoftTimeLimitExceeded:
        result = {"error": "The check took too long and was stopped."}
    except Exception:  # noqa: BLE001 - the link must never stay "checking" forever
        logger.exception("check of link %s failed", link_id)
        result = {"error": "Something went wrong while checking this link. Try again."}
    failed = "videos" not in result
    DiscoveredLink.objects.filter(pk=link_id).update(
        check_status=(
            DiscoveredLink.CheckStatus.FAILED if failed else DiscoveredLink.CheckStatus.CHECKED
        ),
        check_result=result,
        checked_at=timezone.now(),
        has_video=link.has_video or bool(result.get("videos")),
        http_status=link.http_status or result.get("http_status"),
        content_type=link.content_type or (result.get("content_type") or "")[:255],
    )


@shared_task
def purge_old_jobs() -> int:
    """Retention: jobs (and their links) older than `extraction.retention_days`. Approved embeds
    stay; their link becomes empty."""
    from .models import ExtractionJob

    days = config.get_int("extraction.retention_days", 30)
    cutoff = timezone.now() - dt.timedelta(days=days)
    stale = ExtractionJob.objects.filter(created_at__lt=cutoff).exclude(
        status__in=ExtractionJob.ACTIVE
    )
    deleted, _ = stale.delete()
    return deleted
