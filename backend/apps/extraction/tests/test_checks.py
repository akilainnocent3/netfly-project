"""Link checks: direct files, HLS / DASH, providers via oEmbed, and the embed sanitiser."""

import json

import pytest

from apps.core.config import config
from apps.extraction.checks import expiry_of, run_check
from apps.extraction.sanitize import sanitize_embed_html

pytestmark = pytest.mark.django_db

ORIGIN = "https://watch.netfly.test"
MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 4096
CORS = {"access-control-allow-origin": "*"}


def mp4(web, url, *, cors=True, ranges=True, headers=None, **kw):
    hdrs = {**(CORS if cors else {}), **({"accept-ranges": "bytes"} if ranges else {})}
    hdrs.update(headers or {})
    web.add(url, MP4, content_type="video/mp4", headers=hdrs, **kw)


# ---- direct files ------------------------------------------------------------------------------


def test_mp4_with_cors_and_ranges_plays(web):
    mp4(web, "https://cdn.example.test/movie.mp4")
    result = run_check("https://cdn.example.test/movie.mp4")
    assert result["link_kind"] == "video_file"
    [video] = result["videos"]
    assert video["kind"] == "file"
    assert video["playable_in_netfly"]["verdict"] == "yes"
    assert video["playable_in_netfly"]["reasons"][0] == (
        "Direct MP4 — plays in NETFLY (CORS allowed, range requests supported)."
    )
    assert video["accept_ranges"] and video["cors"]
    assert video["embed"] == {"type": "mp4", "src": "https://cdn.example.test/movie.mp4"}
    assert video["origins"] == ["https://cdn.example.test"]
    assert result["recommended"] == 0
    # The check sent our origin, so CORS is evaluated for NETFLY specifically.
    assert any(r.headers.get("origin") == ORIGIN for r in web.sent("cdn.example.test"))


def test_mp4_without_cors_or_ranges_plays_with_warnings(web):
    mp4(web, "https://cdn.example.test/plain.mp4", cors=False, ranges=False)
    [video] = run_check("https://cdn.example.test/plain.mp4")["videos"]
    verdict = video["playable_in_netfly"]
    assert verdict["verdict"] == "yes"
    assert verdict["reasons"][0] == "Direct MP4 — plays in NETFLY."
    assert "No range requests: viewers can't seek." in verdict["reasons"]
    assert any(r.startswith("No CORS") for r in verdict["reasons"])
    assert not video["accept_ranges"] and not video["cors"]


def test_hotlink_protection_is_detected(web):
    def handler(request):
        import httpx

        from apps.extraction.tests.conftest import Stream

        status = 403 if request.headers.get("referer") else 200
        return httpx.Response(status, headers={"content-type": "video/mp4"}, stream=Stream(MP4))

    web.add("https://cdn.example.test/guarded.mp4", handler=handler)
    [video] = run_check("https://cdn.example.test/guarded.mp4")["videos"]
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert "hotlink protection" in video["playable_in_netfly"]["reasons"][0]


def test_http_file_on_https_netfly_is_mixed_content(web):
    mp4(web, "http://cdn.example.test/old.mp4")
    [video] = run_check("http://cdn.example.test/old.mp4")["videos"]
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert any("mixed content" in r for r in video["playable_in_netfly"]["reasons"])


def test_expiring_signed_file_is_temporary(web):
    url = "https://cdn.example.test/movie.mp4?X-Amz-Date=20261001T000000Z&X-Amz-Expires=3600&X-Amz-Signature=abc"
    mp4(web, url)
    [video] = run_check(url)["videos"]
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert any(
        "Temporary link — will stop working (expires 2026-10-01 01:00 UTC)" in r
        for r in video["playable_in_netfly"]["reasons"]
    )


@pytest.mark.parametrize(
    "url, hint",
    [
        ("https://x.test/a.mp4?Expires=1893456000&Signature=s&Key-Pair-Id=k", "expires 2030-01-01"),
        ("https://x.test/a.m3u8?hdnts=st=1~exp=1893456000~acl=/*~hmac=ab", "expires 2030-01-01"),
        ("https://x.test/a.mp4?se=2030-01-01T00:00:00Z&sig=abc&sv=2020", "expires 2030-01-01"),
        (
            "https://x.test/a.mp4?Policy=p&Signature=s&Key-Pair-Id=k",
            "signed link with an expiry policy",
        ),
        ("https://x.test/a.mp4?id=12345", None),
    ],
)
def test_expiry_detection(url, hint):
    found = expiry_of(url)
    assert (found is None) if hint is None else hint in found


def test_a_document_named_mp4_is_not_a_video(web):
    web.add("https://cdn.example.test/fake.mp4", b"%PDF-1.4 ...", content_type="application/pdf")
    result = run_check("https://cdn.example.test/fake.mp4")
    assert result["link_kind"] == "document"
    assert result["videos"] == [] and result["recommended"] is None


def test_a_file_with_a_misleading_type_is_not_a_video(web):
    web.add("https://cdn.example.test/page.mp4", b"\x89PNG\r\n\x1a\n" + b"0" * 64, content_type="")
    mp4_page = "https://site.example.test/w"
    web.page(mp4_page, '<video src="https://cdn.example.test/page.mp4"></video>')
    [video] = run_check(mp4_page)["videos"]
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert video["playable_in_netfly"]["reasons"][0].startswith("Not a video file")


# ---- HLS / DASH ------------------------------------------------------------------------------------

MASTER = """#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080/index.m3u8
"""
MEDIA = """#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg0.ts
#EXTINF:4.0,
seg1.ts
#EXT-X-ENDLIST
"""
HLS = {"content_type": "application/vnd.apple.mpegurl", "headers": CORS}


def hls_site(web, *, media=MEDIA, cors=True):
    kw = {"content_type": "application/vnd.apple.mpegurl", "headers": CORS if cors else {}}
    web.add("https://stream.example.test/show/master.m3u8", MASTER, **kw)
    web.add("https://stream.example.test/show/360/index.m3u8", media, **kw)
    web.add("https://stream.example.test/show/1080/index.m3u8", media, **kw)
    web.add(
        "https://stream.example.test/show/360/seg0.ts",
        b"G" * 2000,
        content_type="video/mp2t",
        headers=CORS if cors else {},
    )


def test_hls_master_with_renditions(web):
    hls_site(web)
    result = run_check("https://stream.example.test/show/master.m3u8")
    assert result["link_kind"] == "stream"
    [video] = result["videos"]
    assert video["kind"] == "hls"
    assert [(r["height"], r["bandwidth"]) for r in video["renditions"]] == [
        (360, 800000),
        (1080, 5000000),
    ]
    assert video["height"] == 1080
    assert video["duration"] == 10.0
    assert video["playable_in_netfly"]["verdict"] == "yes"
    assert video["playable_in_netfly"]["reasons"][0] == (
        "HLS, 2 renditions up to 1080p, 0:10 — plays in NETFLY (CORS allowed)."
    )
    assert video["embed"] == {"type": "hls", "src": "https://stream.example.test/show/master.m3u8"}
    # The cheapest rendition and its first segment were checked, with our origin.
    assert web.sent("stream.example.test", "/show/360/seg0.ts")[0].headers["origin"] == ORIGIN


def test_hls_without_cors_cannot_play(web):
    hls_site(web, cors=False)
    [video] = run_check("https://stream.example.test/show/master.m3u8")["videos"]
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert any("CORS" in r for r in video["playable_in_netfly"]["reasons"])


@pytest.mark.parametrize(
    "key",
    [
        '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://key",KEYFORMAT="com.apple.streamingkeydelivery"',
        '#EXT-X-KEY:METHOD=SAMPLE-AES-CTR,URI="data:x",KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
    ],
)
def test_hls_drm_is_detected(web, key):
    hls_site(web, media=MEDIA.replace("#EXT-X-TARGETDURATION:6", f"#EXT-X-TARGETDURATION:6\n{key}"))
    [video] = run_check("https://stream.example.test/show/master.m3u8")["videos"]
    assert video["drm"] is True
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert (
        "Encrypted stream (DRM) — cannot be played without a licence."
        in video["playable_in_netfly"]["reasons"]
    )


def test_hls_aes128_is_a_warning_not_drm(web):
    hls_site(
        web,
        media=MEDIA.replace(
            "#EXTINF:6.0,", '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:6.0,'
        ),
    )
    [video] = run_check("https://stream.example.test/show/master.m3u8")["videos"]
    assert video["drm"] is False
    assert video["playable_in_netfly"]["verdict"] == "yes"
    assert any("AES-128" in r for r in video["playable_in_netfly"]["reasons"])


def test_hls_with_expiring_token_is_temporary(web):
    url = "https://stream.example.test/show/master.m3u8?exp=1893456000&sig=abc"
    hls_site(web)
    [video] = run_check(url)["videos"]
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert any(r.startswith("Temporary link") for r in video["playable_in_netfly"]["reasons"])


def test_dash_drm_and_renditions(web):
    mpd = """<?xml version="1.0"?>
    <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT1M30S">
      <Period><AdaptationSet>
        <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>
        <Representation id="1" bandwidth="3000000" width="1280" height="720" codecs="avc1.64001f"/>
      </AdaptationSet></Period>
    </MPD>"""
    web.add("https://stream.example.test/a.mpd", mpd, content_type="application/dash+xml")
    [video] = run_check("https://stream.example.test/a.mpd")["videos"]
    assert video["kind"] == "dash" and video["drm"] is True
    assert video["duration"] == 90 and video["height"] == 720
    assert video["playable_in_netfly"]["verdict"] == "no"


# ---- pages, providers and oEmbed ---------------------------------------------------------------


def test_page_with_youtube_embed_uses_official_oembed(web):
    web.page(
        "https://blog.example.test/post",
        '<title>Post</title><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
        headers={"x-frame-options": "SAMEORIGIN"},
    )
    oembed = {
        "type": "video",
        "provider_name": "YouTube",
        "title": "Never Gonna Give You Up",
        "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        "width": 200,
        "height": 113,
        "html": '<iframe width="200" height="113" src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed" '
        'frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen '
        'onload="alert(1)" title="Never Gonna Give You Up"></iframe><script>alert(2)</script>',
    }
    web.add("https://www.youtube.com/oembed", json.dumps(oembed), content_type="application/json")
    result = run_check("https://blog.example.test/post")
    assert result["page_embeddable"]["verdict"] == "no"
    [video] = result["videos"]
    assert video["kind"] == "provider_embed" and video["provider"] == "YouTube"
    assert video["playable_in_netfly"] == {
        "verdict": "yes",
        "reasons": ["Embeddable via YouTube's official player."],
    }
    assert video["embed"]["type"] == "oembed"
    assert "onload" not in video["embed"]["html"] and "<script" not in video["embed"]["html"]
    assert video["embed"]["src"] == "https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed"
    assert result["recommended"] == 0
    asked = web.sent("www.youtube.com", "/oembed")[0]
    assert "watch%3Fv%3DdQw4w9WgXcQ" in str(asked.url)  # oEmbed is asked about the watch page


def test_oembed_401_means_embedding_disabled(web):
    web.add(
        "https://vimeo.com/api/oembed.json",
        '{"error": "x"}',
        status=403,
        content_type="application/json",
    )
    result = run_check("https://vimeo.com/76979871")
    video = next(v for v in result["videos"] if v["provider"] == "Vimeo")
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert "embedding is disabled by the owner" in video["playable_in_netfly"]["reasons"][0]
    assert result["recommended"] is None


def test_facebook_needs_a_token(web):
    result = run_check("https://www.facebook.com/somepage/videos/123/")
    video = next(v for v in result["videos"] if v["provider"] == "Facebook")
    assert video["playable_in_netfly"]["verdict"] == "unknown"
    assert "Needs a provider token" in video["playable_in_netfly"]["reasons"][0]


def test_oembed_discovered_in_page(web):
    web.page(
        "https://videos.example.test/v/9",
        '<link rel="alternate" type="application/json+oembed" href="https://videos.example.test/oembed?url=9">',
    )
    body = {
        "type": "video",
        "title": "Clip 9",
        "html": '<iframe src="https://player.example.test/embed/9" width="640" height="360"></iframe>',
    }
    web.add("https://videos.example.test/oembed", json.dumps(body), content_type="application/json")
    [video] = run_check("https://videos.example.test/v/9")["videos"]
    # The player host shares the site's registrable domain, so its iframe is accepted.
    assert video["playable_in_netfly"]["verdict"] == "yes"
    assert video["embed"]["src"] == "https://player.example.test/embed/9"
    assert video["title"] == "Clip 9"


def test_page_with_direct_video_and_json_ld_facts(web):
    web.page(
        "https://site.example.test/watch",
        """<title>Watch</title><meta property="og:description" content="A film.">
        <script type="application/ld+json">{"@type":"VideoObject","name":"Film","duration":"PT1M2S",
        "contentUrl":"/files/film.mp4","thumbnailUrl":"/t.jpg"}</script>""",
    )
    mp4(web, "https://site.example.test/files/film.mp4")
    result = run_check("https://site.example.test/watch")
    assert result["page_embeddable"]["verdict"] == "yes"
    assert result["description"] == "A film."
    [video] = result["videos"]
    assert video["title"] == "Film" and video["duration"] == 62.0
    assert video["thumbnail"] == "https://site.example.test/t.jpg"
    assert result["recommended"] == 0  # a playable video beats framing the whole page


def test_tracking_iframes_are_not_videos(web):
    web.page(
        "https://site.example.test/p", '<iframe src="https://tags.example.test/ns.html"></iframe>'
    )
    web.page("https://tags.example.test/ns.html", "<p>tracking</p>")
    result = run_check("https://site.example.test/p")
    assert result["videos"] == []
    assert result["recommended"] == "page"


def test_unknown_player_page_is_judged_by_its_headers(web):
    web.page("https://site.example.test/p", '<iframe src="https://player.other.test/e/1"></iframe>')
    web.page(
        "https://player.other.test/e/1",
        "<video src='/x.mp4'></video>",
        headers={"x-frame-options": "DENY"},
    )
    [video] = run_check("https://site.example.test/p")["videos"]
    assert video["playable_in_netfly"]["verdict"] == "no"
    assert "X-Frame-Options: DENY" in video["playable_in_netfly"]["reasons"][0]


def test_unreachable_link(web):
    web.resolve("gone.example.test", "nxdomain")
    result = run_check("https://gone.example.test/")
    assert result["reachable"] is False
    assert result["error"] == "The address doesn't exist (DNS)."


def test_client_origins_include_cors_origins(web):
    config.set(
        "security.cors_allowed_origins", ["https://watch.netfly.test", "https://m.netfly.test"]
    )
    web.page("https://site.example.test/", "<p>x</p>")
    assert run_check("https://site.example.test/")["client_origins"] == [
        "https://watch.netfly.test",
        "https://m.netfly.test",
    ]


# ---- sanitiser --------------------------------------------------------------------------------------


def test_sanitiser_keeps_one_allowed_iframe_only():
    ok = sanitize_embed_html(
        '<div><iframe src="https://player.vimeo.com/video/1" width="640px" height="360" '
        'allow="autoplay; camera; fullscreen" onload="x()" style="border:0" srcdoc="<b>"></iframe></div>'
    )
    html, src = ok
    assert src == "https://player.vimeo.com/video/1"
    assert html == (
        '<iframe src="https://player.vimeo.com/video/1" width="640" height="360" '
        'allow="autoplay; fullscreen" referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>'
    )
    assert sanitize_embed_html('<iframe src="https://evil.test/x"></iframe>') is None
    assert sanitize_embed_html('<iframe src="http://player.vimeo.com/video/1"></iframe>') is None
    assert sanitize_embed_html('<iframe src="javascript:alert(1)"></iframe>') is None
    two = '<iframe src="https://player.vimeo.com/a"></iframe><iframe src="https://player.vimeo.com/b"></iframe>'
    assert sanitize_embed_html(two) is None
    assert sanitize_embed_html("<blockquote>tiktok</blockquote><script src=x></script>") is None
    quoted = sanitize_embed_html(
        '<iframe src="https://www.youtube.com/embed/x" title="a&quot;onx=&quot;"></iframe>'
    )
    assert 'title="a&quot;onx=&quot;"' in quoted[0]


def test_thumbnails_are_fetched_server_side_as_small_data_uris(web):
    import io

    from PIL import Image

    png = io.BytesIO()
    Image.new("RGB", (1280, 720), (200, 30, 30)).save(png, "PNG")
    web.page(
        "https://site.example.test/w",
        '<meta property="og:image" content="/og.png"><video src="/v.mp4" poster="/og.png"></video>'
        '<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"/v.mp4",'
        '"thumbnailUrl":"/evil.png"}</script>',
    )
    web.add("https://site.example.test/og.png", png.getvalue(), content_type="image/png")
    web.add(
        "https://site.example.test/evil.png", b"<script>alert(1)</script>", content_type="image/png"
    )
    mp4(web, "https://site.example.test/v.mp4")
    result = run_check("https://site.example.test/w")
    data = result["thumbnail_data"]
    assert data.startswith("data:image/jpeg;base64,")
    import base64

    with Image.open(io.BytesIO(base64.b64decode(data.split(",", 1)[1]))) as thumb:
        assert thumb.size == (320, 180)
    assert result["videos"][0]["thumbnail_data"] == ""  # not an image: nothing, never the bytes
