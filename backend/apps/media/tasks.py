import logging

from celery import shared_task
from celery.signals import worker_ready
from celery.worker.control import control_command

from .models import ImageAsset

logger = logging.getLogger(__name__)

TRANSCODE_QUEUE = "transcode"


def _consumes_transcode(consumer) -> bool:
    task_consumer = getattr(consumer, "task_consumer", None)
    return any(q.name == TRANSCODE_QUEUE for q in getattr(task_consumer, "queues", []))


@worker_ready.connect
def check_toolchain_on_start(sender=None, **_kwargs) -> None:
    """Shout at startup if this worker takes video jobs but can't run FFmpeg."""
    if not _consumes_transcode(sender):
        return  # default-queue workers never transcode
    from .transcode import toolchain

    status = toolchain()
    if status["ok"]:
        logger.info(
            "Transcoding toolchain ready: ffmpeg %s, ffprobe %s",
            status["ffmpeg_version"],
            status["ffprobe_version"],
        )
    else:
        logger.error("%s (%s)", status["message"], status.get("log", ""))


@control_command()
def netfly_toolchain(state) -> dict:
    """Studio's toolchain status. A control command, not a task: the worker's main process
    answers it even while its pool is busy encoding, and no result backend is needed."""
    if not _consumes_transcode(state.consumer):
        return {"transcode": False}
    from .transcode import toolchain

    status = toolchain()
    return {
        "transcode": True,
        "ok": status["ok"],
        "ffmpeg_version": status["ffmpeg_version"],
        "ffprobe_version": status["ffprobe_version"],
        "message": status["message"],
    }


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
            _bump_if_shown(asset_id)
            return
        raise self.retry(exc=exc) from exc
    _bump_if_shown(asset_id)


def _bump_if_shown(asset_id: str) -> None:
    """Category tiles are cached under the catalog version and were built while this artwork
    was still rendering (with a fallback image). Now that it's ready (or has failed), rebuild."""
    from apps.catalog.models import Genre
    from apps.recommendations.cache import bump_catalog

    if Genre.objects.filter(artwork_id=asset_id).exists():
        bump_catalog()


# A generated trailer's progress bar: cutting fills 0–20 %, the normal pipeline 20–100 %.
CUT_SHARE = 20.0


def _updater(asset_id: str, base: float = 0.0, span: float = 100.0):
    """Write job fields; `progress` is given 0–100 and lands in base…base+span."""
    from django.utils import timezone

    from .models import VideoAsset

    stage_max = VideoAsset._meta.get_field("stage").max_length

    def update(**fields):
        fields.setdefault("updated_at", timezone.now())
        if "stage" in fields and len(fields["stage"]) > stage_max:
            # A long ladder ("Encoding 6 renditions (2160p, 1080p-high, …)") must never fail a job.
            fields["stage"] = fields["stage"][: stage_max - 1] + "…"
        if "progress" in fields:
            fields["progress"] = round(base + span * fields["progress"] / 100, 1)
        VideoAsset.objects.filter(pk=asset_id).update(**fields)

    return update


def _toolchain_or_fail(asset) -> bool:
    """Before downloading anything: a missing FFmpeg is the operator's to fix, not a retry."""
    from django.utils import timezone

    from . import transcode as tc
    from .models import VideoAsset

    try:
        tc.require_toolchain()
    except tc.MissingToolchain as exc:
        logger.error("Video job %s can't start: %s (%s)", asset.pk, exc, exc.log)
        VideoAsset.objects.filter(pk=asset.pk).update(
            status=VideoAsset.Status.FAILED,
            stage="Failed",
            error=str(exc)[:2000],
            log=exc.log,
            attempts=asset.attempts + 1,
            finished_at=timezone.now(),
            updated_at=timezone.now(),
        )
        return False
    return True


def _retry_or_fail(task, asset_id: str, exc: Exception, update) -> None:
    """Transient errors retry with backoff (raises Retry); permanent ones fail the job."""
    from django.utils import timezone

    from apps.core import storage
    from apps.core.config import config

    from .models import VideoAsset

    log_text = getattr(exc, "log", "") or ""
    permanent = isinstance(exc, storage.StorageNotConfigured) or getattr(exc, "permanent", False)
    logger.warning("Video job %s failed (attempt %s): %s", asset_id, task.request.retries + 1, exc)
    if not permanent and task.request.retries < config.get_int("transcoding.max_retries", 3):
        update(
            status=VideoAsset.Status.QUEUED,
            stage="Retrying shortly",
            error=str(exc)[:2000],
            log=log_text,
        )
        raise task.retry(exc=exc, countdown=min(600, 30 * 2**task.request.retries)) from exc
    update(
        status=VideoAsset.Status.FAILED,
        stage="Failed",
        error=str(exc)[:2000],
        log=log_text,
        finished_at=timezone.now(),
    )


@shared_task(bind=True, acks_late=True, reject_on_worker_lost=True, max_retries=10)
def transcode_asset(self, asset_id: str) -> None:
    """Transcode one VideoAsset into an HLS ladder. Runs on the dedicated `transcode` queue."""
    _transcode(self, asset_id)


def _transcode(task, asset_id: str, base: float = 0.0, span: float = 100.0) -> None:
    from django.utils import timezone

    from apps.core import storage
    from apps.core.config import config

    from . import transcode as tc
    from .models import VideoAsset

    asset = VideoAsset.objects.filter(pk=asset_id).first()
    if asset is None or not asset.source_key:
        return
    if not _toolchain_or_fail(asset):
        return
    update = _updater(asset_id, base, span)

    fields = {"started_at": timezone.now()} if not base else {}
    update(
        status=VideoAsset.Status.TRANSCODING,
        stage="Downloading source",
        progress=1,
        attempts=asset.attempts + (0 if base else 1),
        error="",
        **fields,
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
        _retry_or_fail(task, asset_id, exc, update)
        return

    from apps.catalog.services import attach_generated_trailer, on_video_ready

    ready = VideoAsset.objects.get(pk=asset_id)
    on_video_ready(ready)
    if ready.clip_options.get("title_id"):
        attach_generated_trailer(ready)
    _fill_runtime(asset_id)


@shared_task(bind=True, acks_late=True, reject_on_worker_lost=True, max_retries=10)
def generate_clip(self, asset_id: str) -> None:
    """Cut a trailer out of another asset's original upload, then transcode it like an upload.

    The cut becomes this asset's own source (`sources/<id>/clip.mp4`), so Retry, sprites and the
    poster need no range logic and the trailer outlives the video it came from (decision 56).
    """
    from django.utils import timezone

    from apps.core import storage
    from apps.core.config import config

    from . import transcode as tc
    from .models import VideoAsset

    asset = VideoAsset.objects.select_related("clip_of").filter(pk=asset_id).first()
    if asset is None:
        return
    if asset.source_key:  # cut on an earlier attempt; only the pipeline needs to run again
        _transcode(self, asset_id, CUT_SHARE, 100 - CUT_SHARE)
        return
    if not _toolchain_or_fail(asset):
        return
    update = _updater(asset_id, 0, CUT_SHARE)
    start, end = asset.clip_start or 0.0, asset.clip_end or 0.0
    span = f"{tc.timecode(start)}–{tc.timecode(end)}"
    update(
        status=VideoAsset.Status.TRANSCODING,
        stage=f"Cutting {span}",
        progress=0,
        started_at=timezone.now(),
        attempts=asset.attempts + 1,
        error="",
    )
    options = asset.clip_options or {}
    try:
        source = asset.clip_of
        if source is None or not source.source_key:
            raise tc.TranscodeError(
                "The video this trailer is cut from has been deleted.", permanent=True
            )
        if storage.object_size(source.source_key) is None:
            raise tc.TranscodeError(
                "The original upload of the source video is gone from storage.", permanent=True
            )
        url = storage.presign_get(source.source_key, 3 * 3600, cdn=False)
        probed = tc.probe(url, remote=True)
        if end > probed.duration + 0.05:
            raise tc.TranscodeError(
                f"The range ends at {tc.timecode(end)} but the video is only "
                f"{tc.timecode(probed.duration)} long.",
                permanent=True,
            )
        length = end - start
        fade = config.get_float("trailer.fade_seconds", 0.5) if options.get("fade", True) else 0
        fade = min(fade, length / 2)
        with tc.Workspace() as work:
            out = work / "clip.mp4"
            log = tc.encode(
                tc.clip_command(
                    url, out, probed, start, length, fade=fade, audio=options.get("audio", True)
                ),
                length,
                lambda p: update(progress=round(100 * p, 1)),
            )
            update(stage="Uploading cut", progress=95)
            key = storage.upload_file(str(out), f"sources/{asset_id}/clip.mp4", "video/mp4")
            update(
                source_key=key,
                source_size=out.stat().st_size,
                source_content_type="video/mp4",
                progress=100,
                log=log[-4000:],
            )
    except Exception as exc:  # noqa: BLE001
        _retry_or_fail(self, asset_id, exc, update)
        return
    _transcode(self, asset_id, CUT_SHARE, 100 - CUT_SHARE)


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
    transcode_asset.apply_async(args=[str(asset.pk)], queue=TRANSCODE_QUEUE)


def queue_generate(asset) -> None:
    """(Re)start a generated trailer from the cut."""
    from django.utils import timezone

    from .models import VideoAsset

    VideoAsset.objects.filter(pk=asset.pk).update(
        status=VideoAsset.Status.QUEUED,
        stage="Waiting for a worker",
        progress=0,
        queued_at=timezone.now(),
        error="",
    )
    generate_clip.apply_async(args=[str(asset.pk)], queue=TRANSCODE_QUEUE)
