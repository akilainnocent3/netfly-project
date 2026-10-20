import logging

from celery import shared_task

from .models import ImageAsset

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def render_image(self, asset_id: str) -> None:
    from django.core.cache import cache

    from .images import render

    asset = ImageAsset.objects.filter(pk=asset_id).first()
    if asset is None:
        return
    try:
        render(asset)
        cache.delete(f"img:{asset.id}")
    except Exception as exc:  # noqa: BLE001
        logger.exception("Image render failed for %s", asset_id)
        if self.request.retries >= self.max_retries:
            ImageAsset.objects.filter(pk=asset_id).update(status=ImageAsset.Status.FAILED, error=str(exc)[:2000])
            return
        raise self.retry(exc=exc) from exc
