"""Breadth-first crawl of one site (Celery, `extraction` queue).

Only the start URL can fail a job. Every other problem (timeouts, 4xx/5xx, TLS) is recorded on
the link it happened to. Database writes happen on the calling thread only; fetch workers
(two per host, paced by `extraction.delay_ms` or the site's Crawl-delay) just fetch and parse.
"""

import logging
import threading
import time
from collections import deque
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from apps.core.config import config

from . import classify
from .fetch import Fetcher, FetchError, FetchResult
from .models import DiscoveredLink, ExtractionJob
from .parse import Found, ParsedPage, parse_html
from .robots import ALLOW_ALL, MAX_SITEMAPS, Robots, parse_sitemap
from .urls_norm import host_of, normalize, origin_of, same_site

logger = logging.getLogger(__name__)

K = DiscoveredLink.Kind
S = DiscoveredLink.Source
PER_HOST_CONCURRENCY = 2
MAX_CRAWL_DELAY = 10.0  # a robots.txt Crawl-delay above this would stall the crawl for hours
FLUSH_SECONDS = 1.0
# Sources that point at media or players: kept even from other sites when staying on-domain.
MEDIA_SOURCES = {S.IFRAME, S.VIDEO_SRC, S.SOURCE_SRC, S.OG_VIDEO, S.JSON_LD, S.OEMBED, S.SCRIPT}
MEDIA_SOURCES |= {S.RENDERED}


def effective_options(options: dict | None) -> dict:
    """Job options clamped to the configured limits (staff can lower them, never raise them)."""
    options = options or {}
    max_pages = config.get_int("extraction.max_pages", 200)
    max_depth = config.get_int("extraction.max_depth", 2)

    def clamp(value, top):
        try:
            return max(0, min(int(value), top))
        except (TypeError, ValueError):
            return top

    return {
        "max_pages": max(1, clamp(options.get("max_pages", max_pages), max_pages)),
        "max_depth": clamp(options.get("max_depth", max_depth), max_depth),
        "same_domain_only": bool(options.get("same_domain_only", True)),
        "same_host_only": bool(options.get("same_host_only", False)),
        "render_js": bool(options.get("render_js", False)),
        "respect_robots": bool(
            options.get("respect_robots", config.get_bool("extraction.respect_robots", True))
        ),
    }


@dataclass
class LinkRec:
    url: str
    kind: str
    source: str
    found_on: str
    depth: int
    is_internal: bool
    http_status: int | None = None
    content_type: str = ""
    title: str = ""
    error: str = ""
    has_video: bool = False
    pk: int | None = None
    dirty: bool = True


class Cancelled(Exception):
    pass


class HostGate:
    """At most N requests in flight per host, and a minimum gap between request starts."""

    def __init__(self, delay: float, concurrency: int = PER_HOST_CONCURRENCY):
        self.delay = delay
        self.concurrency = concurrency
        self.lock = threading.Lock()
        self.hosts: dict[str, tuple[threading.Semaphore, list[float]]] = {}

    def __call__(self, host: str):
        with self.lock:
            sem, next_at = self.hosts.setdefault(
                host, (threading.Semaphore(self.concurrency), [0.0])
            )
        return _Slot(self, sem, next_at)


class _Slot:
    def __init__(self, gate: HostGate, sem, next_at):
        self.gate, self.sem, self.next_at = gate, sem, next_at

    def __enter__(self):
        self.sem.acquire()
        with self.gate.lock:
            now = time.monotonic()
            start = max(now, self.next_at[0])
            self.next_at[0] = start + self.gate.delay
        if start > now:
            time.sleep(start - now)

    def __exit__(self, *exc):
        self.sem.release()


class Crawler:
    def __init__(self, job: ExtractionJob, *, fetcher: Fetcher | None = None, renderer=None):
        self.job = job
        self.opts = effective_options(job.options)
        self.fetcher = fetcher or Fetcher()
        self.renderer = renderer
        self.max_links = config.get_int("extraction.max_links", 5000)
        self.max_probes = config.get_int("extraction.max_probes", 300)
        self.delay = config.get_int("extraction.delay_ms", 500) / 1000
        self.links: dict[str, LinkRec] = {}
        self.queue: deque[tuple[str, int]] = deque()
        self.queued: set[str] = set()
        self.robots: dict[str, Robots] = {}
        self.robots_lock = threading.Lock()
        self.pages_crawled = 0
        self.robots_skipped = 0
        self.link_limit_hit = False
        self.current_url = ""
        self.last_flush = 0.0
        self.root_host = ""
        self.notes: list[str] = []

    # ---- public ----------------------------------------------------------------------------

    def run(self) -> None:
        job = self.job
        updated = ExtractionJob.objects.filter(
            pk=job.pk, status=ExtractionJob.Status.QUEUED
        ).update(status=ExtractionJob.Status.CRAWLING, started_at=timezone.now(), options=self.opts)
        if not updated:
            return  # cancelled before a worker picked it up
        try:
            self._crawl()
            self._flush(force=True)
        except Cancelled:
            self._flush(force=True, check_cancel=False)
            ExtractionJob.objects.filter(pk=job.pk).update(
                finished_at=timezone.now(), current_url="", notes=self.notes
            )
            return
        except FetchError as exc:
            self._fail(exc.message)
            return
        except Exception:  # noqa: BLE001 - a crawler bug must not leave the job "crawling"
            logger.exception("extraction job %s crashed", job.pk)
            self._fail("Something went wrong while crawling. Try again.")
            return
        finally:
            self.fetcher.close()
            if self.renderer:
                self.renderer.close()
        ExtractionJob.objects.filter(pk=job.pk, status=ExtractionJob.Status.CRAWLING).update(
            status=ExtractionJob.Status.DONE,
            progress=100,
            finished_at=timezone.now(),
            current_url="",
            notes=self.notes,
        )

    # ---- crawl -----------------------------------------------------------------------------

    def _crawl(self) -> None:
        start = normalize(self.job.start_url)
        if not start:
            raise FetchError("invalid_url", "That isn't a valid web address.")
        self.root_host = host_of(start)
        robots = self._robots_for(start)
        if not robots.allowed(start):
            raise FetchError(
                "robots",
                "robots.txt asks bots not to crawl this page. "
                "Turn off “Respect robots.txt” to check it anyway.",
            )
        if (delay := robots.crawl_delay()) is not None:
            self.delay = max(self.delay, min(delay, MAX_CRAWL_DELAY))
            if delay > MAX_CRAWL_DELAY:
                self.notes.append(
                    f"robots.txt asks for {delay:g} s between requests; used {MAX_CRAWL_DELAY:g} s."
                )
        self.gate = HostGate(self.delay)
        self.current_url = start
        result = self._fetch_page(start)
        if result.status >= 400:
            raise FetchError("http", f"The site answered HTTP {result.status}.")
        final = normalize(result.final_url) or start
        self.root_host = host_of(final)
        ExtractionJob.objects.filter(pk=self.job.pk).update(normalized_origin=origin_of(final))
        self.queued.update({start, final})  # fetched already: never queued again
        self._add(Found(start, S.START, None), found_on="", depth=0)
        if final != start:
            self.links[start].http_status = (
                result.redirects[0]["status"] if result.redirects else None
            )
            self._add(Found(final, S.REDIRECT, None), found_on=start, depth=0)
        self.pages_crawled = 1
        self._record_page(self.links[final], result)
        self._read_sitemaps(final, robots)
        self._bfs()
        self._probe()

    def _bfs(self) -> None:
        workers = 1 if self.renderer else PER_HOST_CONCURRENCY
        if workers == 1:
            while self.queue and self.pages_crawled < self.opts["max_pages"]:
                url, depth = self.queue.popleft()
                self._process(url, depth, self._visit(url))
                self._flush()
            self._note_limits()
            return
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="crawl") as pool:
            inflight: dict[Future, tuple[str, int]] = {}
            try:
                while self.queue or inflight:
                    while (
                        self.queue
                        and len(inflight) < workers
                        and self.pages_crawled + len(inflight) < self.opts["max_pages"]
                    ):
                        url, depth = self.queue.popleft()
                        inflight[pool.submit(self._visit, url)] = (url, depth)
                    if not inflight:
                        break
                    done, _ = wait(
                        list(inflight), timeout=FLUSH_SECONDS, return_when=FIRST_COMPLETED
                    )
                    for future in done:
                        url, depth = inflight.pop(future)
                        self._process(url, depth, future.result())
                    self._flush()
            except Cancelled:
                for future in inflight:
                    future.cancel()
                raise
        self._note_limits()

    def _note_limits(self) -> None:
        if self.queue and self.pages_crawled >= self.opts["max_pages"]:
            self.notes.append(
                f"Stopped at the {self.opts['max_pages']}-page limit; {len(self.queue)} more pages were found but not crawled."
            )
        if self.robots_skipped:
            self.notes.append(
                f"{self.robots_skipped} pages skipped because robots.txt disallows them."
            )
        if self.link_limit_hit:
            self.notes.append(f"Stopped recording links at the {self.max_links}-link limit.")

    def _visit(self, url: str):
        """Worker thread: fetch (and render) one page. Returns (result, parsed, error)."""
        self.current_url = url
        try:
            result = self._fetch_page(url)
        except FetchError as exc:
            return None, None, exc.message
        parsed = None
        if result.status < 400 and _is_html(result):
            parsed = self._parse(result)
        return result, parsed, ""

    def _fetch_page(self, url: str) -> FetchResult:
        with self.gate(host_of(url)) if hasattr(self, "gate") else _nullcontext():
            return self.fetcher.fetch(url)

    def _parse(self, result: FetchResult) -> ParsedPage:
        page_url = normalize(result.final_url) or result.final_url
        if self.renderer:
            rendered = self.renderer.render(page_url)
            if rendered is not None:
                parsed = parse_html(rendered.html, page_url)
                for media in rendered.media:
                    parsed.links.append(Found(media, S.RENDERED, classify.by_extension(media)))
                return parsed
        return parse_html(result.text(), page_url)

    def _process(self, url: str, depth: int, outcome) -> None:
        result, parsed, error = outcome
        rec = self.links.get(url)
        if rec is None:
            return
        self.pages_crawled += 1
        if error:
            rec.error, rec.dirty = error[:300], True
            return
        self._record_page(rec, result, parsed)

    def _record_page(
        self, rec: LinkRec, result: FetchResult, parsed: ParsedPage | None = None
    ) -> None:
        rec.http_status = result.status
        rec.content_type = result.content_type[:255]
        rec.dirty = True
        if result.status >= 400:
            rec.error = f"HTTP {result.status}"
            return
        kind = classify.by_content_type(result.content_type) or classify.sniff(result.body[:2048])
        if kind and rec.kind != K.EMBED:
            rec.kind = kind
            rec.has_video = rec.has_video or kind in DiscoveredLink.VIDEO_KINDS
        if rec.kind == K.PAGE and parsed is None and _is_html(result):
            parsed = self._parse(result)
        if parsed is None:
            return
        rec.title = parsed.title[:500]
        for found in parsed.links:
            self._add(found, found_on=rec.url, depth=rec.depth + 1)

    def _read_sitemaps(self, start: str, robots: Robots) -> None:
        origin = origin_of(start)
        pending = deque(dict.fromkeys([*robots.sitemaps(), f"{origin}/sitemap.xml"]))
        fetched = 0
        while pending and fetched < MAX_SITEMAPS:
            sitemap_url = normalize(pending.popleft())
            if not sitemap_url or not same_site(sitemap_url, self.root_host):
                continue
            fetched += 1
            try:
                with self.gate(host_of(sitemap_url)):
                    result = self.fetcher.fetch(sitemap_url, max_bytes=20 * 1024 * 1024)
            except FetchError:
                continue
            if result.status >= 400:
                continue
            sitemap = parse_sitemap(result.body, sitemap_url)
            pending.extend(sitemap.children)
            for entry in sitemap.entries:
                self._add(
                    Found(entry.url, S.SITEMAP, entry.kind, entry.meta),
                    found_on=sitemap_url,
                    depth=1,
                )
            self._flush()

    # ---- links -----------------------------------------------------------------------------

    def _add(self, found: Found, *, found_on: str, depth: int) -> None:
        url = found.url
        if url in self.links:
            rec = self.links[url]
            # A later sighting from a player/media source upgrades a bare anchor.
            if (
                found.kind in DiscoveredLink.VIDEO_KINDS
                and rec.kind not in DiscoveredLink.VIDEO_KINDS
            ):
                rec.kind, rec.has_video, rec.dirty = found.kind, True, True
            return
        internal = same_site(url, self.root_host, host_only=self.opts["same_host_only"])
        if not internal and self.opts["same_domain_only"]:
            if (
                found.source not in MEDIA_SOURCES
                and classify.by_extension(url) not in DiscoveredLink.VIDEO_KINDS
            ):
                return
        if len(self.links) >= self.max_links:
            self.link_limit_hit = True
            return
        kind = _kind_for(url, found.kind)
        rec = LinkRec(
            url=url,
            kind=kind,
            source=found.source,
            found_on=found_on,
            depth=depth,
            is_internal=internal,
            title=str(found.meta.get("title") or found.meta.get("text") or "")[:500],
            has_video=kind in DiscoveredLink.VIDEO_KINDS,
        )
        self.links[url] = rec
        if (
            kind == K.PAGE
            and internal
            and depth <= self.opts["max_depth"]
            and url not in self.queued
        ):
            if self.opts["respect_robots"] and not self._robots_for(url).allowed(url):
                self.robots_skipped += 1
                return
            self.queued.add(url)
            self.queue.append((url, depth))

    def _robots_for(self, url: str) -> Robots:
        if not self.opts["respect_robots"]:
            return ALLOW_ALL
        origin = origin_of(url)
        with self.robots_lock:
            if origin in self.robots:
                return self.robots[origin]
        text = None
        try:
            result = self.fetcher.fetch(f"{origin}/robots.txt", read_limit=512 * 1024)
            if result.status < 400 and "html" not in result.content_type:
                text = result.text()
        except FetchError:
            text = None  # unreachable robots.txt: no rules to obey
        robots = Robots(text)
        with self.robots_lock:
            self.robots[origin] = robots
        return robots

    # ---- probing (classify what wasn't crawled) ---------------------------------------------

    def _probe(self) -> None:
        candidates = [
            rec
            for rec in self.links.values()
            if rec.http_status is None
            and not rec.error
            and (
                rec.kind in (K.VIDEO_FILE, K.STREAM)
                or (
                    rec.kind == K.OTHER
                    and rec.is_internal
                    and classify.by_extension(rec.url) is None
                )
            )
        ][: self.max_probes]
        if not candidates:
            return
        done = 0
        with ThreadPoolExecutor(
            max_workers=PER_HOST_CONCURRENCY, thread_name_prefix="probe"
        ) as pool:
            futures = {pool.submit(self._head, rec.url): rec for rec in candidates}
            for future in futures:
                rec = futures[future]
                status, content_type, head, error = future.result()
                rec.http_status, rec.content_type, rec.error, rec.dirty = (
                    status,
                    content_type[:255],
                    error[:300],
                    True,
                )
                # An error page (a 404's HTML) says nothing about what the link is.
                ok = status is not None and status < 400
                kind = ok and (classify.by_content_type(content_type) or classify.sniff(head))
                if kind and rec.kind != K.EMBED:
                    rec.kind = kind
                    rec.has_video = rec.has_video or kind in DiscoveredLink.VIDEO_KINDS
                done += 1
                self.probe_progress = done / len(candidates)
                try:
                    self._flush()
                except Cancelled:
                    for f in futures:
                        f.cancel()
                    raise

    def _head(self, url: str) -> tuple[int | None, str, bytes, str]:
        """HEAD, or a ranged GET of the first 1 KB where HEAD isn't allowed (then sniff it)."""
        try:
            with self.gate(host_of(url)):
                result = self.fetcher.fetch(url, method="HEAD")
            if result.status in (403, 405, 501) or not result.content_type:
                with self.gate(host_of(url)):
                    result = self.fetcher.fetch(
                        url, headers={"Range": "bytes=0-1023"}, read_limit=1024
                    )
            return result.status, result.content_type, result.body[:1024], ""
        except FetchError as exc:
            return None, "", b"", exc.message

    # ---- persistence -----------------------------------------------------------------------

    def _flush(self, force: bool = False, check_cancel: bool = True) -> None:
        now = time.monotonic()
        if not force and now - self.last_flush < FLUSH_SECONDS:
            return
        self.last_flush = now
        new = [r for r in self.links.values() if r.pk is None]
        changed = [r for r in self.links.values() if r.pk is not None and r.dirty]
        with transaction.atomic():
            if new:
                objs = [
                    DiscoveredLink(
                        job_id=self.job.pk,
                        url=r.url,
                        kind=r.kind,
                        source=r.source,
                        found_on=r.found_on,
                        depth=r.depth,
                        http_status=r.http_status,
                        content_type=r.content_type,
                        title=r.title,
                        is_internal=r.is_internal,
                        error=r.error,
                        has_video=r.has_video,
                    )
                    for r in new
                ]
                DiscoveredLink.objects.bulk_create(objs, batch_size=500)
                for rec, obj in zip(new, objs, strict=True):
                    rec.pk, rec.dirty = obj.pk, False
            if changed:
                objs = []
                for r in changed:
                    objs.append(
                        DiscoveredLink(
                            pk=r.pk,
                            kind=r.kind,
                            http_status=r.http_status,
                            content_type=r.content_type,
                            title=r.title,
                            error=r.error,
                            has_video=r.has_video,
                        )
                    )
                    r.dirty = False
                DiscoveredLink.objects.bulk_update(
                    objs,
                    ["kind", "http_status", "content_type", "title", "error", "has_video"],
                    batch_size=500,
                )
            total_pages = self.pages_crawled + len(self.queue)
            limit = self.opts["max_pages"]
            crawl = self.pages_crawled / max(1, min(limit, total_pages)) if total_pages else 1
            progress = min(99.0, 90 * min(1.0, crawl) + 10 * getattr(self, "probe_progress", 0))
            status = (
                ExtractionJob.objects.filter(pk=self.job.pk)
                .values_list("status", flat=True)
                .first()
            )
            ExtractionJob.objects.filter(
                pk=self.job.pk, status=ExtractionJob.Status.CRAWLING
            ).update(
                pages_crawled=self.pages_crawled,
                links_found=len(self.links),
                progress=round(progress, 1),
                current_url=self.current_url[:2048],
            )
        if check_cancel and status == ExtractionJob.Status.CANCELLED:
            raise Cancelled

    def _fail(self, message: str) -> None:
        self._flush(force=True, check_cancel=False)
        ExtractionJob.objects.filter(pk=self.job.pk).exclude(
            status=ExtractionJob.Status.CANCELLED
        ).update(
            status=ExtractionJob.Status.FAILED,
            error=message,
            finished_at=timezone.now(),
            current_url="",
            notes=self.notes,
        )


def _kind_for(url: str, hint: str | None) -> str:
    ext = classify.by_extension(url)
    if ext in DiscoveredLink.VIDEO_KINDS:
        return ext
    if hint:
        return hint
    return ext or K.OTHER


def _is_html(result: FetchResult) -> bool:
    ct = result.content_type
    if ct in classify.PAGE_TYPES:
        return True
    return not ct and classify.sniff(result.body[:2048]) == K.PAGE


class _nullcontext:
    def __enter__(self):
        return None

    def __exit__(self, *exc):
        return None
