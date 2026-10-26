"""The crawl: breadth-first limits, robots.txt, same-site rules, errors, progress and cancel."""

import httpx
import pytest

from apps.core.config import config
from apps.extraction import crawler as crawler_module
from apps.extraction.crawler import Crawler
from apps.extraction.models import DiscoveredLink, ExtractionJob

pytestmark = pytest.mark.django_db

SITE = "https://www.example.test"


def make_job(url=f"{SITE}/", **options):
    return ExtractionJob.objects.create(start_url=url, options=options)


def crawl(url=f"{SITE}/", **options) -> ExtractionJob:
    job = make_job(url, **options)
    Crawler(job).run()
    job.refresh_from_db()
    return job


def links(job) -> dict[str, DiscoveredLink]:
    return {link.url: link for link in job.links.all()}


def chain_site(web, depth=5, fanout=1):
    """/ → /d1 → /d2 → … (each page links to the next level)."""
    for level in range(depth + 1):
        path = "/" if level == 0 else f"/d{level}"
        anchors = "".join(f'<a href="/d{level + 1}?n={i}">next</a>' for i in range(fanout))
        web.page(f"{SITE}{path}", f"<title>Level {level}</title>{anchors}")
        for i in range(fanout):
            web.page(
                f"{SITE}/d{level + 1}?n={i}",
                f"<title>L{level + 1}</title><a href='/d{level + 2}?n=0'>x</a>",
            )


def test_breadth_first_crawl_finds_and_classifies_links(web):
    web.page(
        f"{SITE}/",
        """<title>Home</title>
        <a href="/about">About</a> <a href="/film.mp4">Film</a> <a href="/doc.pdf">PDF</a>
        <img src="/logo.png"> <iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>
        <a href="https://elsewhere.test/page">External page</a>
        <video><source src="https://cdn.other.test/v.m3u8"></video>""",
    )
    web.page(f"{SITE}/about", "<title>About us</title><a href='/'>home</a>")
    web.add(f"{SITE}/film.mp4", b"\0\0\0\x18ftypmp42" + b"\0" * 100, content_type="video/mp4")
    web.add(
        "https://cdn.other.test/v.m3u8", "#EXTM3U\n", content_type="application/vnd.apple.mpegurl"
    )
    job = crawl()
    assert job.status == "done" and job.progress == 100 and job.error == ""
    found = links(job)
    assert found[f"{SITE}/"].source == "start" and found[f"{SITE}/"].title == "Home"
    assert found[f"{SITE}/about"].kind == "page" and found[f"{SITE}/about"].title == "About us"
    assert found[f"{SITE}/about"].http_status == 200
    assert found[f"{SITE}/film.mp4"].kind == "video_file" and found[f"{SITE}/film.mp4"].has_video
    assert found[f"{SITE}/film.mp4"].http_status == 200  # probed with HEAD
    assert found[f"{SITE}/doc.pdf"].kind == "document"
    assert found[f"{SITE}/logo.png"].kind == "image"
    assert found["https://www.youtube.com/embed/abcdefghijk"].kind == "embed"
    assert found["https://www.youtube.com/embed/abcdefghijk"].is_internal is False
    # Staying on the domain (default) still records other sites' videos, but not their pages.
    assert "https://elsewhere.test/page" not in found
    assert found["https://cdn.other.test/v.m3u8"].kind == "stream"
    assert job.pages_crawled == 2 and job.links_found == len(found)
    assert job.normalized_origin == SITE


def test_external_links_are_recorded_but_never_crawled_when_allowed(web):
    web.page(f"{SITE}/", '<a href="https://elsewhere.test/page">x</a>')
    web.page("https://elsewhere.test/page", '<a href="https://elsewhere.test/deeper">y</a>')
    job = crawl(same_domain_only=False)
    found = links(job)
    assert found["https://elsewhere.test/page"].is_internal is False
    assert "https://elsewhere.test/deeper" not in found
    assert not web.sent("elsewhere.test", "/page")


def test_subdomains_are_the_same_site_unless_host_only(web):
    web.page(f"{SITE}/", '<a href="https://blog.example.test/post">blog</a>')
    web.page("https://blog.example.test/post", "<title>Post</title>")
    assert links(crawl())["https://blog.example.test/post"].http_status == 200
    web.requests.clear()
    job = crawl(same_host_only=True, same_domain_only=False)
    assert links(job)["https://blog.example.test/post"].is_internal is False
    assert not web.sent("blog.example.test", "/post")


def test_depth_limit(web):
    chain_site(web, depth=5)
    job = crawl(max_depth=2)
    fetched = {
        r.url.path for r in web.requests if r.method == "GET" and r.url.path.startswith("/d")
    }
    assert fetched == {"/d1", "/d2"}
    assert "https://www.example.test/d3?n=0" in links(job)  # recorded at depth 3, not crawled
    assert links(job)["https://www.example.test/d3?n=0"].depth == 3


def test_page_limit(web):
    chain_site(web, depth=1, fanout=10)
    job = crawl(max_pages=4)
    assert job.pages_crawled == 4
    assert any("4-page limit" in note for note in job.notes)


def test_staff_cannot_raise_limits_above_config(web):
    config.set("extraction.max_pages", 3)
    chain_site(web, depth=1, fanout=10)
    job = crawl(max_pages=999)
    assert job.options["max_pages"] == 3 and job.pages_crawled == 3


def test_link_limit(web):
    config.set("extraction.max_links", 50)
    web.page(f"{SITE}/", "".join(f'<a href="/p{i}">{i}</a>' for i in range(200)))
    job = crawl(max_depth=0)
    assert job.links_found == 50 == job.links.count()
    assert any("50-link limit" in note for note in job.notes)


def test_duplicate_urls_are_recorded_once(web):
    web.page(
        f"{SITE}/",
        '<a href="/x?b=2&a=1">1</a><a href="/x?a=1&b=2#f">2</a><a href="https://WWW.example.test:443/x?a=1&b=2&utm_source=t">3</a>',
    )
    job = crawl(max_depth=0)
    assert job.links.filter(url=f"{SITE}/x?a=1&b=2").count() == 1
    assert job.links.count() == 2


def test_robots_disallow_and_crawl_delay(web, monkeypatch):
    sleeps = []
    monkeypatch.setattr(crawler_module.time, "sleep", lambda s: sleeps.append(s))
    web.add(
        f"{SITE}/robots.txt",
        "User-agent: *\nDisallow: /private/\nCrawl-delay: 2\n",
        content_type="text/plain",
    )
    web.page(f"{SITE}/", '<a href="/private/secret">s</a><a href="/public">p</a>')
    web.page(f"{SITE}/public", "ok")
    web.page(f"{SITE}/private/secret", "nope")
    job = crawl()
    assert not web.sent("www.example.test", "/private/secret")
    assert web.sent("www.example.test", "/public")
    assert f"{SITE}/private/secret" in links(job)  # recorded, not fetched
    assert any("robots.txt disallows" in n for n in job.notes)
    # Paced by Crawl-delay: each request start waits its 2 s turn behind the previous one.
    assert sleeps and min(sleeps) > 1.0


def test_robots_can_be_ignored_per_crawl(web):
    web.add(f"{SITE}/robots.txt", "User-agent: *\nDisallow: /\n", content_type="text/plain")
    web.page(f"{SITE}/", "<a href='/a'>a</a>")
    web.page(f"{SITE}/a", "a")
    blocked = crawl()
    assert blocked.status == "failed" and "robots.txt" in blocked.error
    allowed = crawl(respect_robots=False)
    assert allowed.status == "done" and web.sent("www.example.test", "/a")


def test_sitemaps_from_robots_and_default_location(web):
    web.add(
        f"{SITE}/robots.txt",
        f"User-agent: *\nAllow: /\nSitemap: {SITE}/index.xml\n",
        content_type="text/plain",
    )
    web.add(
        f"{SITE}/index.xml",
        f'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>{SITE}/videos.xml</loc></sitemap></sitemapindex>',
        content_type="application/xml",
    )
    web.add(
        f"{SITE}/videos.xml",
        f"""<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
        <url><loc>{SITE}/watch/1</loc><video:video><video:content_loc>{SITE}/v/1.m3u8</video:content_loc>
        <video:player_loc>{SITE}/embed/1</video:player_loc></video:video></url></urlset>""",
        content_type="application/xml",
        gzip_body=True,
    )
    web.add(
        f"{SITE}/sitemap.xml",
        f"<urlset><url><loc>{SITE}/from-default</loc></url></urlset>",
        content_type="text/xml",
    )
    web.page(f"{SITE}/", "home")
    found = links(crawl())
    assert found[f"{SITE}/watch/1"].source == "sitemap"
    assert found[f"{SITE}/v/1.m3u8"].kind == "stream"
    assert found[f"{SITE}/embed/1"].kind == "embed"
    assert found[f"{SITE}/from-default"].source == "sitemap"


def test_per_page_errors_do_not_fail_the_job(web):
    def timeout(request):
        raise httpx.ReadTimeout("slow")

    web.page(
        f"{SITE}/",
        '<a href="/slow">s</a><a href="/missing">m</a><a href="/broken">b</a><a href="/ok">o</a>',
    )
    web.add(f"{SITE}/slow", handler=timeout)
    web.add(f"{SITE}/broken", "oops", status=500)
    web.page(f"{SITE}/ok", "fine")
    job = crawl()
    assert job.status == "done"
    found = links(job)
    assert found[f"{SITE}/slow"].error == "The site didn't respond within 15 s."
    assert (
        found[f"{SITE}/missing"].http_status == 404 and found[f"{SITE}/missing"].error == "HTTP 404"
    )
    assert found[f"{SITE}/broken"].http_status == 500
    assert found[f"{SITE}/ok"].http_status == 200


@pytest.mark.parametrize(
    "setup, message",
    [
        (
            lambda web: web.resolve("www.example.test", "nxdomain"),
            "The address doesn't exist (DNS).",
        ),
        (
            lambda web: web.add(f"{SITE}/", handler=_raise(httpx.ConnectTimeout("t"))),
            "The site didn't respond within 15 s.",
        ),
        (
            lambda web: web.add(
                f"{SITE}/", handler=_raise(httpx.ConnectError("Connection refused"))
            ),
            "The site refused the connection.",
        ),
        (
            lambda web: web.add(
                f"{SITE}/", handler=_raise(httpx.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED]"))
            ),
            "TLS certificate problem.",
        ),
        (lambda web: web.add(f"{SITE}/", "x", status=503), "The site answered HTTP 503."),
    ],
)
def test_only_the_start_url_can_fail_a_job(web, setup, message):
    setup(web)
    job = crawl()
    assert job.status == "failed"
    assert job.error == message
    assert job.finished_at is not None


def _raise(exc):
    def handler(request):
        raise exc

    return handler


def test_start_url_that_is_a_video_file(web):
    web.add(f"{SITE}/movie.mp4", b"\0\0\0\x18ftypisom" + b"\0" * 64, content_type="video/mp4")
    job = crawl(f"{SITE}/movie.mp4")
    assert job.status == "done"
    [link] = job.links.all()
    assert link.kind == "video_file" and link.has_video


def test_redirected_start_url_is_recorded(web):
    web.add("https://example.test/", status=301, headers={"location": f"{SITE}/"})
    web.page(f"{SITE}/", "<title>Home</title>")
    job = crawl("https://example.test/")
    found = links(job)
    assert found["https://example.test/"].source == "start"
    assert found["https://example.test/"].http_status == 301
    assert found[f"{SITE}/"].source == "redirect"


def test_cancel_stops_the_crawl(web, monkeypatch):
    chain_site(web, depth=1, fanout=30)
    job = make_job(max_pages=50)
    calls = {"n": 0}
    original = Crawler._flush

    def flush(self, force=False, check_cancel=True):
        calls["n"] += 1
        if calls["n"] == 3:
            ExtractionJob.objects.filter(pk=job.pk).update(status="cancelled")
        return original(self, force=True, check_cancel=check_cancel)

    monkeypatch.setattr(Crawler, "_flush", flush)
    Crawler(job).run()
    job.refresh_from_db()
    assert job.status == "cancelled"
    assert job.pages_crawled < 31
    assert job.finished_at is not None


def test_cancelled_before_start_does_nothing(web):
    web.page(f"{SITE}/", "x")
    job = make_job()
    ExtractionJob.objects.filter(pk=job.pk).update(status="cancelled")
    Crawler(job).run()
    assert not web.requests


def test_progress_is_written_while_crawling(web, monkeypatch):
    chain_site(web, depth=1, fanout=5)
    seen = []
    job = make_job(max_depth=1)
    real_flush = Crawler._flush

    def flush(self, force=False, check_cancel=True):
        real_flush(self, force=True, check_cancel=check_cancel)
        seen.append(
            ExtractionJob.objects.values_list("pages_crawled", "links_found").get(pk=job.pk)
        )

    monkeypatch.setattr(Crawler, "_flush", flush)
    Crawler(job).run()
    assert seen[0][0] >= 1 and seen[-1][0] == 6
    assert [s[0] for s in seen] == sorted(s[0] for s in seen)
