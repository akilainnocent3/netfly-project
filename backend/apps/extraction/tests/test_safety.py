"""SSRF guard (decision 67): addresses, ports, DNS, redirects, size caps, cookies, credentials."""

import gzip
import zlib

import httpx
import pytest

from apps.core.config import config
from apps.extraction.fetch import Fetcher, FetchError
from apps.extraction.safety import BlockedURL, check_url, validate_url

pytestmark = pytest.mark.django_db

PRIVATE = [
    "http://127.0.0.1/",
    "http://127.8.9.10/",
    "http://10.0.0.1/",
    "http://10.255.255.254/",
    "http://172.16.0.1/",
    "http://172.31.255.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.1.1/",
    "http://100.64.0.1/",  # CGNAT
    "http://0.0.0.0/",
    "http://224.0.0.1/",  # multicast
    "http://240.0.0.1/",  # reserved
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fd12:3456::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",  # IPv4-mapped loopback
    "http://[::ffff:10.0.0.1]/",
]


@pytest.mark.parametrize("url", PRIVATE)
def test_private_and_special_addresses_are_refused(url, web):
    with pytest.raises(BlockedURL):
        check_url(url)
    with pytest.raises(FetchError):
        Fetcher().fetch(url)
    assert not web.requests  # never connected


@pytest.mark.parametrize(
    "url, code",
    [
        ("ftp://example.test/file", "invalid_scheme"),
        ("file:///etc/passwd", "invalid_scheme"),
        ("gopher://example.test/", "invalid_scheme"),
        ("javascript:alert(1)", "invalid_scheme"),
        ("example.test", "invalid_scheme"),
        ("http://example.test:8080/", "blocked_port"),
        ("https://example.test:22/", "blocked_port"),
        ("http://localhost/", "blocked_url"),
        ("http://metadata.google.internal/", "blocked_url"),
        ("http:///nohost", "invalid_url"),
    ],
)
def test_invalid_urls_have_clear_messages(url, code, web):
    with pytest.raises(BlockedURL) as err:
        check_url(url)
    assert err.value.code == code
    assert err.value.message.endswith(".")


def test_allowed_ports_come_from_config(web):
    config.set("extraction.allowed_ports", [80, 443, 8080])
    assert validate_url("http://example.test:8080/").port == 8080


def test_hostname_resolving_to_a_private_ip_is_refused(web):
    web.resolve("intranet.example.test", "10.1.2.3")
    with pytest.raises(BlockedURL, match="private network"):
        check_url("https://intranet.example.test/")
    # One private answer among public ones is enough (DNS rebinding trick).
    web.resolve("mixed.example.test", ["93.184.216.34", "192.168.0.10"])
    with pytest.raises(BlockedURL):
        check_url("https://mixed.example.test/")
    web.resolve("meta.example.test", "169.254.169.254")
    with pytest.raises(BlockedURL, match="metadata"):
        check_url("https://meta.example.test/")


def test_unknown_host_is_a_dns_error(web):
    web.resolve("nope.example.test", "nxdomain")
    with pytest.raises(BlockedURL) as err:
        check_url("https://nope.example.test/")
    assert err.value.code == "dns"
    assert err.value.message == "The address doesn't exist (DNS)."


def test_connection_is_pinned_to_the_vetted_ip(web):
    web.page("https://site.example.test/", "<p>hi</p>")
    web.resolve("site.example.test", "93.184.216.40")
    result = Fetcher().fetch("https://site.example.test/")
    request = web.requests[0]
    assert request.url.host == "93.184.216.40"  # connected to the address we checked
    assert request.headers["host"] == "site.example.test"
    assert request.extensions["sni_hostname"] == "site.example.test"
    assert result.final_url == "https://site.example.test/"


def test_redirect_to_a_private_ip_is_refused(web):
    web.add(
        "https://site.example.test/go", status=302, headers={"location": "http://10.0.0.5/admin"}
    )
    with pytest.raises(FetchError) as err:
        Fetcher().fetch("https://site.example.test/go")
    assert "private network" in err.value.message
    assert [r.headers["host"] for r in web.requests] == ["site.example.test"]


def test_redirect_to_a_name_that_resolves_privately_is_refused(web):
    web.resolve("evil.example.test", "127.0.0.1")
    web.add(
        "https://site.example.test/go",
        status=301,
        headers={"location": "https://evil.example.test/"},
    )
    with pytest.raises(FetchError, match="loopback"):
        Fetcher().fetch("https://site.example.test/go")


def test_redirect_to_a_non_web_port_is_refused(web):
    web.add(
        "https://site.example.test/go",
        status=302,
        headers={"location": "http://site.example.test:6379/"},
    )
    with pytest.raises(FetchError) as err:
        Fetcher().fetch("https://site.example.test/go")
    assert err.value.code == "blocked_port"


def test_redirects_are_followed_and_recorded_up_to_five(web):
    for i in range(6):
        web.add(f"https://site.example.test/r{i}", status=302, headers={"location": f"/r{i + 1}"})
    web.page("https://site.example.test/r6", "end")
    with pytest.raises(FetchError) as err:
        Fetcher().fetch("https://site.example.test/r0")
    assert err.value.code == "too_many_redirects"
    ok = Fetcher().fetch("https://site.example.test/r2")
    assert ok.status == 200 and len(ok.redirects) == 4
    assert ok.redirects[0] == {"url": "https://site.example.test/r3", "status": 302}


def test_credentials_are_stripped_and_no_cookies_or_auth_sent(web):
    web.add(
        "https://site.example.test/a",
        status=302,
        headers={"location": "/b", "set-cookie": "sid=secret; Path=/"},
    )
    web.page("https://site.example.test/b", "ok")
    fetcher = Fetcher()
    fetcher.fetch(
        "https://user:pass@site.example.test/a",
        headers={"Authorization": "Bearer x", "Cookie": "a=b"},
    )
    for request in web.requests:
        assert "authorization" not in request.headers
        assert "cookie" not in request.headers
        assert "user" not in str(request.url)
    assert (
        validate_url("https://user:pass@site.example.test/x").url == "https://site.example.test/x"
    )


def test_oversized_bodies_are_aborted(web):
    config.set("extraction.max_response_mb", 1)
    web.add("https://site.example.test/big", b"x" * (1024 * 1024 + 10), content_type="text/html")
    with pytest.raises(FetchError) as err:
        Fetcher().fetch("https://site.example.test/big")
    assert err.value.code == "too_large"
    assert err.value.message == "The response is larger than 1 MB."


def test_decompression_bombs_are_aborted(web):
    config.set("extraction.max_response_mb", 1)
    bomb = gzip.compress(b"\0" * (50 * 1024 * 1024))  # 50 MB of zeros in ~50 KB
    assert len(bomb) < 100 * 1024
    web.add(
        "https://site.example.test/bomb",
        bomb,
        headers={"content-encoding": "gzip"},
    )
    with pytest.raises(FetchError) as err:
        Fetcher().fetch("https://site.example.test/bomb")
    assert err.value.code == "too_large"
    raw = zlib.compress(b"\0" * (50 * 1024 * 1024))
    web.add("https://site.example.test/deflate", raw, headers={"content-encoding": "deflate"})
    with pytest.raises(FetchError, match="larger than"):
        Fetcher().fetch("https://site.example.test/deflate")


def test_gzip_pages_are_decoded(web):
    web.add("https://site.example.test/", "<title>Zipped</title>", gzip_body=True)
    assert b"Zipped" in Fetcher().fetch("https://site.example.test/").body


def test_probe_reads_only_the_first_bytes_of_media(web):
    web.add(
        "https://site.example.test/movie.mp4", b"\0" * (5 * 1024 * 1024), content_type="video/mp4"
    )
    result = Fetcher().fetch("https://site.example.test/movie.mp4", probe_media=True)
    assert len(result.body) == 1024 and result.truncated


@pytest.mark.parametrize(
    "exc, code, message",
    [
        (httpx.ConnectTimeout("t"), "timeout", "The site didn't respond within 15 s."),
        (httpx.ReadTimeout("t"), "timeout", "The site didn't respond within 15 s."),
        (
            httpx.ConnectError("[Errno 111] Connection refused"),
            "refused",
            "The site refused the connection.",
        ),
        (
            httpx.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed"),
            "tls",
            "TLS certificate problem.",
        ),
    ],
)
def test_network_failures_have_human_messages(web, exc, code, message):
    def boom(request):
        raise exc

    web.add("https://site.example.test/", handler=boom)
    with pytest.raises(FetchError) as err:
        Fetcher().fetch("https://site.example.test/")
    assert (err.value.code, err.value.message) == (code, message)


def test_test_mode_allow_list_reaches_a_local_fixture_site_only_in_test_mode(web):
    config.set("extraction.test_hosts", ["127.0.0.1:4599"])
    with pytest.raises(BlockedURL):
        check_url("http://127.0.0.1:4599/")  # test mode off: still refused
    config.set("testing.mock_providers", True)
    assert check_url("http://127.0.0.1:4599/").test_host
    with pytest.raises(BlockedURL):
        check_url("http://127.0.0.1:4600/")  # only the listed host:port
    config.set("extraction.test_hosts", ["169.254.169.254:80"])
    with pytest.raises(FetchError, match="metadata"):
        Fetcher().fetch("http://169.254.169.254/")  # the metadata service never
