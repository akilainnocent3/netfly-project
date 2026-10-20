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
            ImageAsset.objects.filter(pk=asset_id).update(
                status=ImageAsset.Status.FAILED, error=str(exc)[:2000]
            )
            return
        raise self.retry(exc=exc) from exc


@shared_task(bind=True, acks_late=True, reject_on_worker_lost=True, max_retries=10)
def transcode_asset(self, asset_id: str) -> None:
    """Transcode one VideoAsset into an HLS ladder. Runs on the dedicated `transcode` queue."""
    from django.utils import timezone

    from apps.core import storage
    from apps.core.config import config

    from . import transcode as tc
    from .models import VideoAsset

    asset = VideoAsset.objects.filter(pk=asset_id).first()
    if asset is None or not asset.source_key:
        return
    max_retries = config.get_int("transcoding.max_retries", 3)

    def update(**fields):
        fields.setdefault("updated_at", timezone.now())
        VideoAsset.objects.filter(pk=asset_id).update(**fields)

    update(
        status=VideoAsset.Status.TRANSCODING,
        stage="Downloading source",
        progress=1,
        started_at=timezone.now(),
        attempts=asset.attempts + 1,
        error="",
    )
    try:
        with tc.Workspace() as work:
            src = str(work / "source")
            if asset.source_size and tc.disk_free(str(work)) < asset.source_size * 3:
                raise tc.TranscodeError("Not enough disk space on the worker for this file.")
            storage.download_file(asset.source_key, src)
            update(stage="Analysing", progress=3)
            source = tc.probe(src)
            ladder = config.get_json("transcoding.ladder") or []
            rungs = tc.build_ladder(source, ladder)
            update(
                duration=source.duration,
                source_width=source.width,
                source_height=source.height,
                source_fps=source.fps,
                source_codec=source.codec,
                ladder_snapshot=[r.__dict__ for r in rungs],
                stage=f"Encoding {len(rungs)} renditions ({', '.join(r.name for r in rungs)})",
                progress=5,
            )
            out = work / "hls"
            out.mkdir()
            log = tc.encode(
                tc.ffmpeg_command(src, out, source, rungs),
                source.duration,
                lambda p: update(progress=round(5 + 80 * p, 1)),
            )
            renditions, audio = tc.parse_master(out / "master.m3u8", rungs)
            update(stage="Generating scrub previews", progress=86)
            sprite = tc.sprites(src, out / "thumbs", source)
            poster = tc.poster_frame(src, out, source)
            update(stage="Uploading renditions", progress=90)
            prefix = f"hls/{asset_id}/a{asset.attempts + 1}"
            tc.upload_tree(out, prefix)
            previous = asset.hls_prefix
            update(
                status=VideoAsset.Status.READY,
                stage="Ready",
                progress=100,
                finished_at=timezone.now(),
                hls_prefix=storage.full_key(prefix),
                master_key=storage.full_key(f"{prefix}/master.m3u8"),
                renditions=renditions,
                audio_tracks=audio,
                sprite={**sprite, "prefix": "thumbs"},
                poster_frame_key=storage.full_key(f"{prefix}/{poster}"),
                log=log[-4000:],
            )
            if previous and previous != storage.full_key(prefix):
                try:
                    storage.delete_prefix(previous.removeprefix(storage.s3_settings().prefix))
                except Exception:  # noqa: BLE001 - old renditions are best-effort cleanup
                    logger.warning("Couldn't delete previous renditions at %s", previous)
    except Exception as exc:  # noqa: BLE001
        log_text = getattr(exc, "log", "") or ""
        permanent = isinstance(exc, storage.StorageNotConfigured) or getattr(
            exc, "permanent", False
        )
        logger.warning(
            "Transcode %s failed (attempt %s): %s", asset_id, self.request.retries + 1, exc
        )
        if not permanent and self.request.retries < max_retries:
            update(
                status=VideoAsset.Status.QUEUED,
                stage="Retrying shortly",
                error=str(exc)[:2000],
                log=log_text,
            )
            raise self.retry(exc=exc, countdown=min(600, 30 * 2**self.request.retries)) from exc
        update(
            status=VideoAsset.Status.FAILED,
            stage="Failed",
            error=str(exc)[:2000],
            log=log_text,
            finished_at=timezone.now(),
        )
        return

    from apps.catalog.services import on_video_ready

    on_video_ready(VideoAsset.objects.get(pk=asset_id))
    _fill_runtime(asset_id)


def _fill_runtime(asset_id: str) -> None:
    """Default title/episode runtime from the transcoded duration if staff left it empty."""
    from apps.catalog.models import Episode, Title

    from .models import VideoAsset

    asset = VideoAsset.objects.get(pk=asset_id)
    minutes = max(1, round(asset.duration / 60))
    Title.objects.filter(video=asset, runtime_minutes__isnull=True).update(runtime_minutes=minutes)
    Episode.objects.filter(video=asset, runtime_minutes__isnull=True).update(
        runtime_minutes=minutes
    )


def queue_transcode(asset) -> None:
    from django.utils import timezone

    from .models import VideoAsset

    VideoAsset.objects.filter(pk=asset.pk).update(
        status=VideoAsset.Status.QUEUED,
        stage="Waiting for a worker",
        progress=0,
        queued_at=timezone.now(),
        error="",
    )
    transcode_asset.apply_async(args=[str(asset.pk)], queue="transcode")
