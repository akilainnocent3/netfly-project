"""Optional JavaScript rendering with Playwright Chromium (`render_js`, off by default).

Only the `extraction` Docker stage installs Chromium. Every request the page makes — documents,
scripts, XHR, media — passes `request_allowed` first (the same SSRF rules as the fetcher), so a
rendered page can't reach the internal network. Media requests (.m3u8/.mpd/.mp4…, video/*) are
captured: they find players that only load their video from JavaScript.
"""

import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache

from .safety import BlockedURL, resolve, validate_url

logger = logging.getLogger(__name__)

MEDIA_URL = re.compile(r"\.(m3u8|mpd|mp4|webm|mov|m4v)(\?|$)", re.I)
MEDIA_TYPES = (
    "video/",
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "application/dash+xml",
)
RENDER_TIMEOUT_MS = 20_000


@dataclass
class Rendered:
    html: str
    media: list[str] = field(default_factory=list)


def request_allowed(url: str) -> bool:
    """May the headless browser load `url`? http(s) to a vetted public address only."""
    if url.startswith(("data:", "blob:", "about:")):
        return True
    try:
        target = validate_url(url)
        resolve(target)
    except BlockedURL:
        return False
    return True


@lru_cache(maxsize=1)
def availability() -> tuple[bool, str]:
    """(available, reason) — whether this process can launch Chromium."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return (
            False,
            "JavaScript rendering needs the extraction worker image with Chromium (Docker stage “extraction”).",
        )
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            browser.close()
    except Exception as exc:  # noqa: BLE001 - any launch failure means "not available"
        logger.warning("Chromium unavailable: %s", exc)
        return False, "Chromium is installed but couldn't start on the extraction worker."
    return True, ""


class Renderer:
    """One Chromium for a crawl; pages rendered one at a time on the crawl thread."""

    def __init__(self, user_agent: str):
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=True,
            args=["--disable-dev-shm-usage", "--no-first-run", "--disable-extensions"],
        )
        self._context = self._browser.new_context(
            user_agent=user_agent,
            java_script_enabled=True,
            accept_downloads=False,
            service_workers="block",
            bypass_csp=False,
        )
        self._context.route("**/*", self._route)

    def _route(self, route):
        if request_allowed(route.request.url):
            route.continue_()
        else:
            route.abort("blockedbyclient")

    def render(self, url: str) -> Rendered | None:
        media: list[str] = []
        page = self._context.new_page()

        def on_request(request):
            if MEDIA_URL.search(request.url):
                media.append(request.url)

        def on_response(response):
            ct = (response.headers.get("content-type") or "").lower()
            if ct.startswith(MEDIA_TYPES):
                media.append(response.url)

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("dialog", lambda d: d.dismiss())
        try:
            page.goto(url, wait_until="networkidle", timeout=RENDER_TIMEOUT_MS)
            html = page.content()
        except (
            Exception
        ) as exc:  # noqa: BLE001 - a page that won't render falls back to static HTML
            logger.info("render failed for %s: %s", url, exc)
            return None
        finally:
            page.close()
        return Rendered(html=html, media=list(dict.fromkeys(media)))

    def close(self) -> None:
        try:
            self._context.close()
            self._browser.close()
        finally:
            self._pw.stop()
