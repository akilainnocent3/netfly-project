import datetime as dt

from celery import shared_task
from django.utils import timezone

from .models import RefreshToken


@shared_task
def cleanup_refresh_tokens() -> int:
    cutoff = timezone.now() - dt.timedelta(days=7)
    deleted, _ = RefreshToken.objects.filter(expires_at__lt=cutoff).delete()
    return deleted
