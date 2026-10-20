import datetime as dt
import logging

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from apps.core.audit import record
from apps.core.config import config

from . import services
from .models import Title

logger = logging.getLogger(__name__)


@shared_task
def publish_scheduled_titles() -> int:
    """Publish titles whose `publish_at` has arrived (and whose license allows it)."""
    now = timezone.now()
    due = Title.objects.filter(status__in=[Title.Status.DRAFT, Title.Status.PROCESSING], publish_at__lte=now).filter(
        Q(license_start__isnull=True) | Q(license_start__lte=now)
    )
    count = 0
    for title in due:
        if services.publish_blockers(title):
            continue
        services.publish(title)
        record(None, "title.scheduled_publish", title, changes={"status": title.status})
        count += 1
    return count


@shared_task
def enforce_licenses() -> dict:
    """Auto-unpublish expired licenses; flag titles expiring within the warning window."""
    now = timezone.now()
    expired = Title.objects.filter(status=Title.Status.PUBLISHED, license_end__lte=now)
    expired_ids = list(expired.values_list("pk", flat=True))
    for title in expired:
        title.status = Title.Status.ARCHIVED
        title.save(update_fields=["status", "updated_at"])
        record(None, "title.license_expired", title, changes={"license_end": str(title.license_end)})
    days = config.get_int("content.license_warning_days", 14)
    warn = Title.objects.filter(
        status=Title.Status.PUBLISHED,
        license_end__gt=now,
        license_end__lte=now + dt.timedelta(days=days),
        license_warning_sent_at__isnull=True,
    )
    warned = []
    for title in warn:
        record(None, "title.license_expiring", title, changes={"license_end": str(title.license_end)})
        logger.warning("License for %s expires %s", title.title, title.license_end)
        warned.append(title.pk)
    Title.objects.filter(pk__in=warned).update(license_warning_sent_at=now)
    return {"expired": expired_ids, "warned": warned}
