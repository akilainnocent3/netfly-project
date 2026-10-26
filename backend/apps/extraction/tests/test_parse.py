"""Link discovery from every source, URL normalisation, robots.txt and sitemaps."""

import gzip

import pytest

from apps.extraction.parse import media_urls_in_text, parse_html, parse_iso_duration
from apps.extraction.robots import Robots, parse_sitemap
from apps.extraction.urls_norm import normalize, registrable_domain, same_site

PAGE = "https://www.example.test/shows/index.html"

FIXTURE = """<!doctype html>
<html><head>
  <title>  Example   Shows </title>
  <base href="/media/">
  <link rel="canonical" href="https://www.example.test/shows/">
  <link rel="alternate" hreflang="sw" href="/sw/shows">
  <link rel="preload" as="video" href="intro.webm">
  <link rel="alternate" type="application/json+oembed" href="https://www.example.test/oembed?url=x&format=json">
  <link rel="stylesheet" href="/site.css">
  <meta property="og:title" content="Big Show">
  <meta property="og:description" content="The biggest show on the web.">
  <meta property="og:image" content="/img/og.jpg">
  <meta property="og:video" content="https://cdn.example.test/og/clip.mp4">
  <meta property="og:video:secure_url" content="https://cdn.example.test/og/clip-secure.mp4">
  <meta name="twitter:player" content="https://player.example.test/embed/42">
  <meta name="twitter:player:stream" content="https://cdn.example.test/tw/stream.m3u8">
  <script type="application/ld+json">
  {"@context": "https://schema.org", "@graph": [
    {"@type": "WebPage", "name": "x"},
    {"@type": "VideoObject", "name": "Episode 1", "contentUrl": "/vod/ep1.mp4",
     "embedUrl": "https://www.youtube.com/embed/abcDEF12345", "thumbnailUrl": ["/thumbs/ep1.jpg"],
     "duration": "PT1H42M10S", "description": "Pilot"}
  ]}
  </script>
</head><body>
  <a href="page2.html">Relative to base</a>
  <a href="/abs/page3?utm_source=x&b=2&a=1#frag">Tracked</a>
  <a href="https://other.test/away">External</a>
  <a href="mailto:hi@example.test">mail</a>
  <a href="javascript:void(0)">js</a>
  <map><area href="/area-link" alt="area"></map>
  <iframe src="https://player.vimeo.com/video/76979871" title="Vimeo"></iframe>
  <embed src="/flash/player.swf">
  <object data="/objects/player.html"></object>
  <video src="/v/direct.mp4" poster="/v/poster.jpg">
    <source src="/v/alt.webm" type="video/webm">
    <source src="/v/hls/master.m3u8" type="application/x-mpegURL">
    <track src="/v/subs.vtt" kind="subtitles">
  </video>
  <audio><source src="/a/song.mp3"></audio>
  <img src="/img/a.png" srcset="/img/a-480.png 480w, /img/a-960.png 960w">
  <picture><source srcset="/img/b.webp 1x, /img/b@2x.webp 2x"></picture>
  <div itemscope itemtype="https://schema.org/VideoObject">
    <meta itemprop="name" content="Microdata clip">
    <link itemprop="contentUrl" href="/micro/clip.mp4">
  </div>
  <div class="player" data-setup='{"sources":[{"src":"/vjs/movie.m3u8","type":"application/x-mpegURL"}]}'></div>
  <div data-video-url="https://cdn.example.test/data/attr.mp4"></div>
  <video data-src="/lazy/stream.m3u8?token=abc"></video>
  <script>
    jwplayer("p").setup({file: "https:\\/\\/cdn.example.test\\/jw\\/movie.mp4", image: "/x.jpg"});
    var cfg = {src: "/rel/dash/manifest.mpd"};
    var notMedia = "https://cdn.example.test/app.js";
  </script>
  <script src="/bundle.js"></script>
</body></html>
"""


@pytest.fixture(scope="module")
def page():
    return parse_html(FIXTURE, PAGE)


def found(page, source=None):
    return {(f.url, f.source) for f in page.links if source is None or f.source == source}


def urls(page, source):
    return {f.url for f in page.links if f.source == source}


def test_title_description_and_base(page):
    assert page.title == "Example Shows"
    assert page.description == "The biggest show on the web."
    assert page.base == "https://www.example.test/media/"
    assert page.image == "https://www.example.test/img/og.jpg"


def test_anchors_area_and_base_resolution(page):
    anchors = urls(page, "a_href")
    assert "https://www.example.test/media/page2.html" in anchors  # relative to <base>
    assert "https://www.example.test/abs/page3?a=1&b=2" in anchors  # sorted, utm stripped, no #
    assert "https://other.test/away" in anchors
    assert not any(u.startswith(("mailto", "javascript")) for u in anchors)
    assert "https://www.example.test/area-link" in anchors


def test_link_elements(page):
    links = {f.url: f for f in page.links if f.source == "link"}
    assert "https://www.example.test/shows/" in links  # canonical
    assert "https://www.example.test/sw/shows" in links  # alternate
    assert (
        links["https://www.example.test/media/intro.webm"].kind == "video_file"
    )  # preload as=video
    assert page.oembed == ["https://www.example.test/oembed?format=json&url=x"]


def test_frames_embeds_objects(page):
    frames = urls(page, "iframe")
    assert {
        "https://player.vimeo.com/video/76979871",
        "https://www.example.test/flash/player.swf",
        "https://www.example.test/objects/player.html",
    } <= frames


def test_frameset_frames():
    html = '<html><frameset cols="50%,50%"><frame src="/left.html"><frame src="right.html"></frameset></html>'
    frames = parse_html(html, "https://example.test/dir/").links
    assert {(f.url, f.source) for f in frames} == {
        ("https://example.test/left.html", "iframe"),
        ("https://example.test/dir/right.html", "iframe"),
    }


def test_media_elements(page):
    kinds = {f.url: f.kind for f in page.links}
    assert kinds["https://www.example.test/v/direct.mp4"] == "video_file"
    assert ("https://www.example.test/v/direct.mp4", "video_src") in found(page)
    assert ("https://www.example.test/v/alt.webm", "source_src") in found(page)
    assert kinds["https://www.example.test/v/hls/master.m3u8"] == "stream"
    assert ("https://www.example.test/v/subs.vtt", "source_src") in found(page)
    assert ("https://www.example.test/a/song.mp3", "source_src") in found(page)
    assert kinds["https://www.example.test/v/poster.jpg"] == "image"


def test_srcset_entries_are_images(page):
    srcset = urls(page, "srcset")
    assert {
        "https://www.example.test/img/a-480.png",
        "https://www.example.test/img/a-960.png",
        "https://www.example.test/img/b.webp",
        "https://www.example.test/img/b@2x.webp",
    } == srcset
    assert all(f.kind == "image" for f in page.links if f.source == "srcset")


def test_open_graph_and_twitter(page):
    og = {f.url: f.kind for f in page.links if f.source == "og_video"}
    assert og == {
        "https://cdn.example.test/og/clip.mp4": "video_file",
        "https://cdn.example.test/og/clip-secure.mp4": "video_file",
        "https://player.example.test/embed/42": "embed",
        "https://cdn.example.test/tw/stream.m3u8": "stream",
    }


def test_json_ld_video_object(page):
    ld = {f.url: f for f in page.links if f.source == "json_ld"}
    content = ld["https://www.example.test/vod/ep1.mp4"]
    assert content.kind == "video_file"
    assert content.meta["title"] == "Episode 1"
    assert content.meta["duration"] == 6130.0
    assert content.meta["thumbnail"] == "https://www.example.test/thumbs/ep1.jpg"
    assert ld["https://www.youtube.com/embed/abcDEF12345"].kind == "embed"
    assert "https://www.example.test/thumbs/ep1.jpg" in ld
    facts = page.videos["https://www.example.test/vod/ep1.mp4"]
    assert facts["description"] == "Pilot"


def test_microdata_video_object(page):
    assert ("https://www.example.test/micro/clip.mp4", "json_ld") in found(page)


def test_media_urls_in_scripts_and_data_attributes(page):
    scripted = urls(page, "script")
    assert "https://cdn.example.test/jw/movie.mp4" in scripted  # JSON-escaped slashes
    assert "https://www.example.test/rel/dash/manifest.mpd" in scripted
    assert "https://www.example.test/vjs/movie.m3u8" in scripted  # video.js data-setup
    assert "https://cdn.example.test/data/attr.mp4" in scripted
    assert "https://www.example.test/lazy/stream.m3u8?token=abc" in scripted  # bare data-src
    assert "https://cdn.example.test/app.js" not in scripted  # conservative: media only
    assert "https://www.example.test/bundle.js" in scripted  # script[src] recorded as other


def test_media_regex_is_conservative():
    text = 'a = "/x/clip.mp4?token=1"; b = "https://cdn.test/live/index.m3u8"; c = "/x/notes.txt"'
    assert media_urls_in_text(text) == ["https://cdn.test/live/index.m3u8", "/x/clip.mp4?token=1"]


def test_iso_durations():
    assert parse_iso_duration("PT1H42M10S") == 6130
    assert parse_iso_duration("PT90S") == 90
    assert parse_iso_duration("P1DT1S") == 86401
    assert parse_iso_duration("123.5") == 123.5
    assert parse_iso_duration("soon") is None


# ---- normalisation -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        (
            "HTTPS://WWW.Example.TEST:443/a/../b/./c?z=1&a=2#top",
            "https://www.example.test/b/c?a=2&z=1",
        ),
        ("http://example.test:80", "http://example.test/"),
        ("http://example.test:8080/x", "http://example.test:8080/x"),
        ("https://user:pw@example.test/p", "https://example.test/p"),
        (
            "https://example.test/p?utm_source=a&utm_medium=b&fbclid=1&gclid=2&id=7",
            "https://example.test/p?id=7",
        ),
        ("https://example.test/a b", "https://example.test/a%20b"),
        ("https://example.test/a%20b", "https://example.test/a%20b"),
        ("https://bücher.example/", "https://xn--bcher-kva.example/"),
        ("//cdn.example.test/x.mp4", None),  # no base: not absolute
        ("ftp://example.test/", None),
        ("data:text/html,hi", None),
    ],
)
def test_normalize(raw, expected):
    assert normalize(raw) == expected


def test_normalize_resolves_against_base_and_dedupes():
    base = "https://example.test/dir/page.html"
    assert normalize("//cdn.example.test/x.mp4", base) == "https://cdn.example.test/x.mp4"
    variants = ["/p?b=2&a=1", "/p?a=1&b=2#x", "https://EXAMPLE.test/p?a=1&b=2&utm_campaign=z"]
    assert len({normalize(v, base) for v in variants}) == 1


def test_registrable_domain_and_same_site():
    assert registrable_domain("a.b.example.co.uk") == "example.co.uk"
    assert registrable_domain("127.0.0.1") == "127.0.0.1"
    assert registrable_domain("player.example.test") == "example.test"  # unknown suffix
    assert same_site("https://blog.example.com/x", "www.example.com")
    assert not same_site("https://blog.example.com/x", "www.example.com", host_only=True)
    assert not same_site("https://example.org/", "www.example.com")


# ---- robots.txt ------------------------------------------------------------------------------------

ROBOTS = """
User-agent: *
Disallow: /private/
Crawl-delay: 3

User-agent: NetflyBot
Disallow: /no-netfly/
Crawl-delay: 2

Sitemap: https://example.test/sitemap-index.xml
"""


def test_robots_rules_for_netflybot():
    robots = Robots(ROBOTS)
    assert not robots.allowed("https://example.test/no-netfly/page")
    # Our own group applies, not "*" (exactly like other crawlers).
    assert robots.allowed("https://example.test/private/page")
    assert robots.crawl_delay() == 2
    assert robots.sitemaps() == ["https://example.test/sitemap-index.xml"]


def test_robots_star_group_applies_when_no_own_group():
    robots = Robots("User-agent: *\nDisallow: /private/\nCrawl-delay: 5\n")
    assert not robots.allowed("https://example.test/private/x")
    assert robots.allowed("https://example.test/public")
    assert robots.crawl_delay() == 5


# ---- sitemaps ----------------------------------------------------------------------------------------


def test_sitemap_index_and_urlset():
    index = b"""<?xml version="1.0"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.test/sitemap-pages.xml.gz</loc></sitemap>
      <sitemap><loc>https://example.test/sitemap-video.xml</loc></sitemap>
    </sitemapindex>"""
    parsed = parse_sitemap(index, "https://example.test/sitemap.xml")
    assert parsed.children == [
        "https://example.test/sitemap-pages.xml.gz",
        "https://example.test/sitemap-video.xml",
    ]
    urlset = gzip.compress(
        b"""<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.test/a</loc></url><url><loc>https://example.test/b?utm_source=x</loc></url>
        </urlset>"""
    )
    pages = parse_sitemap(urlset, "https://example.test/sitemap-pages.xml.gz")
    assert [(e.url, e.kind) for e in pages.entries] == [
        ("https://example.test/a", "page"),
        ("https://example.test/b", "page"),
    ]


def test_video_sitemap():
    data = b"""<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
      <url><loc>https://example.test/watch/1</loc>
        <video:video>
          <video:thumbnail_loc>https://example.test/t/1.jpg</video:thumbnail_loc>
          <video:title>Grilling steaks</video:title>
          <video:description>How to.</video:description>
          <video:content_loc>https://cdn.example.test/1.mp4</video:content_loc>
          <video:player_loc>https://example.test/player?video=1</video:player_loc>
          <video:duration>600</video:duration>
        </video:video>
      </url>
    </urlset>"""
    entries = {
        (e.url, e.kind): e.meta for e in parse_sitemap(data, "https://example.test/v.xml").entries
    }
    assert ("https://example.test/watch/1", "page") in entries
    content = entries[("https://cdn.example.test/1.mp4", "video_file")]
    assert content == {
        "title": "Grilling steaks",
        "description": "How to.",
        "thumbnail": "https://example.test/t/1.jpg",
        "duration": 600.0,
    }
    assert ("https://example.test/player?video=1", "embed") in entries
    assert ("https://example.test/t/1.jpg", "image") in entries


def test_hostile_sitemaps_are_ignored():
    billion = b"""<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">
    <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]>
    <urlset><url><loc>&lol2;</loc></url></urlset>"""
    assert parse_sitemap(billion, "https://example.test/s.xml").entries == []
    assert parse_sitemap(b"not xml", "https://example.test/s.xml").entries == []
    bomb = gzip.compress(b"<urlset>" + b" " * (30 * 1024 * 1024) + b"</urlset>")
    assert parse_sitemap(bomb, "https://example.test/s.xml.gz").entries == []
