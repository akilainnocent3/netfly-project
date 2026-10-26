"""A fake internet for extraction tests: fake DNS + an httpx.MockTransport routed by Host.

No test reaches the real network. Every host resolves to a public documentation address unless a
test maps it elsewhere (e.g. a private IP, to prove the SSRF guard refuses it).
"""

import gzip
import socket
from dataclasses import dataclass, field

import httpx
import pytest

from apps.core.config import config
from apps.extraction import checks, fetch, safety

PUBLIC_IP = "93.184.216.34"


class Stream(httpx.SyncByteStream):
    """Streamed like a real socket (httpx pre-reads `content=` responses, a network never does)."""

    def __init__(self, data: bytes):
        self.data = data

    def __iter__(self):
        for i in range(0, len(self.data), 65536):
            yield self.data[i : i + 65536]


@dataclass
class Route:
    status: int = 200
    body: bytes = b""
    headers: dict = field(default_factory=dict)
    handler: object = None  # callable(request) -> httpx.Response, overrides the rest


class FakeWeb:
    def __init__(self):
        self.routes: dict[str, Route] = {}
        self.requests: list[httpx.Request] = []
        self.dns: dict[str, list[str]] = {}

    # ---- set-up helpers ----------------------------------------------------------------------

    def add(
        self,
        url: str,
        body: bytes | str = b"",
        *,
        status=200,
        content_type="text/html",
        headers=None,
        handler=None,
        gzip_body=False,
    ):
        parts = httpx.URL(url)
        key = f"{parts.host}{':' + str(parts.port) if parts.port else ''}{parts.raw_path.decode()}"
        if isinstance(body, str):
            body = body.encode()
        hdrs = {"content-type": content_type} if content_type else {}
        hdrs.update(headers or {})
        if gzip_body:
            body = gzip.compress(body)
            hdrs["content-encoding"] = "gzip"
        self.routes[key] = Route(status, body, hdrs, handler)

    def page(self, url: str, html: str, **kw):
        self.add(url, html, **kw)

    def resolve(self, host: str, ip: str | list[str]):
        self.dns[host] = ip if isinstance(ip, list) else [ip]

    # ---- transport ---------------------------------------------------------------------------

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        host = request.headers["host"]
        path = request.url.raw_path.decode()
        route = self.routes.get(f"{host}{path}") or self.routes.get(
            f"{host}{path.split('?', 1)[0]}"
        )
        if route is None:
            return httpx.Response(
                404, headers={"content-type": "text/html"}, stream=Stream(b"<h1>404</h1>")
            )
        if route.handler:
            return route.handler(request)
        body = route.body
        headers = dict(route.headers)
        status = route.status
        rng = request.headers.get("range")
        if rng and headers.get("accept-ranges") == "bytes" and status == 200 and body:
            start, _, end = rng.removeprefix("bytes=").partition("-")
            start, end = int(start), int(end or len(body) - 1)
            headers["content-range"] = f"bytes {start}-{min(end, len(body) - 1)}/{len(body)}"
            body, status = body[start : end + 1], 206
        if request.method == "HEAD":
            headers.setdefault("content-length", str(len(body)))
            body = b""
        return httpx.Response(status, headers=headers, stream=Stream(body))

    def getaddrinfo(self, host, port, *args, **kwargs):
        ips = self.dns.get(host, [PUBLIC_IP])
        if ips == ["nxdomain"]:
            raise socket.gaierror(socket.EAI_NONAME, "Name or service not known")
        family = lambda ip: socket.AF_INET6 if ":" in ip else socket.AF_INET  # noqa: E731
        return [(family(ip), socket.SOCK_STREAM, 6, "", (ip, port)) for ip in ips]

    def sent(self, host: str, path: str | None = None) -> list[httpx.Request]:
        return [
            r
            for r in self.requests
            if r.headers["host"] == host and (path is None or r.url.path == path)
        ]


@pytest.fixture
def web(monkeypatch, db):
    fake = FakeWeb()
    monkeypatch.setattr(safety, "getaddrinfo", fake.getaddrinfo)
    monkeypatch.setattr(fetch, "transport_factory", lambda: httpx.MockTransport(fake))
    # ffprobe on fake bytes would only add noise; probing is covered separately.
    monkeypatch.setattr(checks, "ffprobe_path", lambda: None)
    config.set("extraction.delay_ms", 0)
    config.set("seo.site_url", "https://watch.netfly.test")
    config.set("security.cors_allowed_origins", ["https://watch.netfly.test"])
    return fake
