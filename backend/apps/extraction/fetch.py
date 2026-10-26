"""The only way extraction code talks to the internet.

Every request goes through `Fetcher.fetch`: the SSRF guard runs on the URL and on every redirect
(max 5), the connection goes to the vetted IP (Host header + TLS SNI keep the name), no cookies,
credentials or proxies from the environment, strict timeouts, and a cap on both the bytes on the
wire and the bytes after decompression (zip-bomb guard).
"""

import time
import zlib
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from apps.core.config import config

from .safety import DEFAULT_PORTS, BlockedURL, Target, resolve, validate_url

MAX_REDIRECTS = 5
# Tests swap this for an httpx.MockTransport (see tests/conftest.py).
transport_factory = None


class FetchError(Exception):
    """A fetch that produced no usable response. `message` is human and shown in Studio."""

    def __init__(self, code: str, message: str, url: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.url = url


@dataclass
class FetchResult:
    url: str
    final_url: str
    status: int
    headers: httpx.Headers
    body: bytes = b""
    redirects: list[dict] = field(default_factory=list)
    truncated: bool = False

    @property
    def content_type(self) -> str:
        return self.headers.get("content-type", "").split(";", 1)[0].strip().lower()

    def header_values(self, name: str) -> list[str]:
        return self.headers.get_list(name)

    def text(self) -> str:
        charset = "utf-8"
        for part in self.headers.get("content-type", "").split(";")[1:]:
            key, _, value = part.strip().partition("=")
            if key.lower() == "charset" and value:
                charset = value.strip("\"' ")
        try:
            return self.body.decode(charset, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")


def user_agent() -> str:
    site = config.get_str("seo.site_url").rstrip("/") or "https://netfly.app"
    template = config.get_str("extraction.user_agent") or "NetflyBot/1.0 (+{site_url})"
    return template.replace("{site_url}", site)


class Fetcher:
    def __init__(
        self,
        *,
        timeout: float | None = None,
        max_bytes: int | None = None,
        transport: httpx.BaseTransport | None = None,
    ):
        self.timeout = float(timeout or config.get_int("extraction.timeout_seconds", 15))
        self.max_bytes = max_bytes or config.get_int("extraction.max_response_mb", 10) * 1024 * 1024
        self.user_agent = user_agent()
        transport = transport or (transport_factory() if transport_factory else None)
        # The transport, not an httpx.Client: no cookie jar, no auth, no proxies or .netrc from
        # the environment, and no redirect handling we don't re-validate ourselves.
        self.transport = transport or httpx.HTTPTransport(http2=True, retries=0, trust_env=False)

    def close(self) -> None:
        self.transport.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def fetch(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: dict | None = None,
        read_limit: int | None = None,
        max_bytes: int | None = None,
        follow: bool = True,
        probe_media: bool = False,
    ) -> FetchResult:
        """Fetch `url`. `read_limit` stops quietly after that many bytes (probes); otherwise a
        body over `max_bytes` raises FetchError("too_large"). `probe_media` reads only the first
        KB of anything that isn't a text document (a video link is never downloaded whole)."""
        redirects: list[dict] = []
        current = url
        deadline = time.monotonic() + self.timeout * 2
        for _ in range(MAX_REDIRECTS + 1):
            target = self._target(current, url)
            response = self._send(target, method, headers, deadline)
            location = response.headers.get("location")
            if follow and response.status_code in (301, 302, 303, 307, 308) and location:
                response.close()
                nxt = urljoin(target.url, location.strip())
                redirects.append({"url": nxt, "status": response.status_code})
                if response.status_code == 303 or (
                    response.status_code in (301, 302) and method == "POST"
                ):
                    method = "GET"
                current = nxt
                continue
            if probe_media and not _is_text(response.headers.get("content-type", "")):
                read_limit = 1024
            try:
                body, truncated = (
                    (b"", False)
                    if method == "HEAD"
                    else self._read(
                        response, read_limit, max_bytes or self.max_bytes, deadline, target.url
                    )
                )
            finally:
                response.close()
            return FetchResult(
                url=url,
                final_url=_strip_fragment(target.url),
                status=response.status_code,
                headers=response.headers,
                body=body,
                redirects=redirects,
                truncated=truncated,
            )
        raise FetchError("too_many_redirects", "The site redirected too many times.", url)

    # ---- internals -----------------------------------------------------------------------

    def _target(self, current: str, original: str) -> Target:
        try:
            return validate_url(current)
        except BlockedURL as exc:
            raise FetchError(exc.code, exc.message, original) from None

    def _send(self, target: Target, method, headers, deadline) -> httpx.Response:
        try:
            ip = resolve(target)
        except BlockedURL as exc:
            raise FetchError(exc.code, exc.message, target.url) from None
        parts = urlsplit(target.url)
        ip_host = f"[{ip}]" if ":" in ip else ip
        host_header = target.host if ":" not in target.host else f"[{target.host}]"
        if target.port != DEFAULT_PORTS[target.scheme]:
            host_header += f":{target.port}"
        pinned = urlunsplit(
            (target.scheme, f"{ip_host}:{target.port}", parts.path or "/", parts.query, "")
        )
        send_headers = {
            "Host": host_header,
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            # Only encodings we decompress ourselves, with a cap.
            "Accept-Encoding": "gzip, deflate",
            "Accept-Language": "en;q=0.9, *;q=0.5",
        }
        for key, value in (headers or {}).items():
            if key.lower() in ("cookie", "authorization", "proxy-authorization", "host"):
                continue  # never sent, whoever asks
            send_headers[key] = value
        extensions = {"timeout": self._timeouts(deadline)}
        if target.scheme == "https":
            extensions["sni_hostname"] = target.host
        request = httpx.Request(method, pinned, headers=send_headers, extensions=extensions)
        try:
            return self.transport.handle_request(request)
        except httpx.ConnectTimeout:
            raise FetchError("timeout", self._timeout_message(), target.url) from None
        except httpx.TimeoutException:
            raise FetchError("timeout", self._timeout_message(), target.url) from None
        except httpx.ConnectError as exc:
            text = str(exc).lower()
            if "certificate" in text or "ssl" in text or "tls" in text:
                raise FetchError("tls", "TLS certificate problem.", target.url) from None
            if "refused" in text:
                raise FetchError(
                    "refused", "The site refused the connection.", target.url
                ) from None
            if "name or service" in text or "nodename" in text or "getaddrinfo" in text:
                raise FetchError("dns", "The address doesn't exist (DNS).", target.url) from None
            raise FetchError("connect", "Couldn't connect to the site.", target.url) from None
        except (httpx.RemoteProtocolError, httpx.LocalProtocolError):
            raise FetchError("protocol", "The site sent an invalid response.", target.url) from None
        except httpx.HTTPError:
            raise FetchError("network", "The connection failed.", target.url) from None

    def _timeouts(self, deadline: float) -> dict:
        left = max(0.5, deadline - time.monotonic())
        read = min(self.timeout, left)
        return {"connect": min(read, 10.0), "read": read, "write": read, "pool": read}

    def _timeout_message(self) -> str:
        return f"The site didn't respond within {int(self.timeout)} s."

    def _read(self, response, read_limit, max_bytes, deadline, url) -> tuple[bytes, bool]:
        encoding = response.headers.get("content-encoding", "").strip().lower()
        decoder = None
        if encoding in ("gzip", "x-gzip", "deflate"):
            decoder = zlib.decompressobj(zlib.MAX_WBITS | 32)  # auto-detect gzip / zlib
        limit = read_limit or max_bytes
        out = bytearray()
        wire = 0
        try:
            for chunk in response.iter_raw(chunk_size=65536):
                if time.monotonic() > deadline:
                    if read_limit:
                        return bytes(out), True
                    raise FetchError("timeout", self._timeout_message(), url)
                wire += len(chunk)
                if wire > max_bytes and not read_limit:
                    raise _too_large(max_bytes, url)
                if decoder is None:
                    out += chunk
                else:
                    try:
                        # Never inflate more than we may keep: a bomb stops at the cap.
                        out += decoder.decompress(chunk, limit - len(out) + 1)
                    except zlib.error:
                        raise FetchError(
                            "protocol", "The site sent a corrupt compressed response.", url
                        ) from None
                    if decoder.unconsumed_tail and not read_limit:
                        raise _too_large(max_bytes, url)
                if len(out) > limit:
                    if read_limit:
                        return bytes(out[:read_limit]), True
                    raise _too_large(max_bytes, url)
        except httpx.TimeoutException:
            if read_limit and out:
                return bytes(out), True
            raise FetchError("timeout", self._timeout_message(), url) from None
        except httpx.HTTPError:
            if read_limit and out:
                return bytes(out), True
            raise FetchError("network", "The connection broke while reading.", url) from None
        return bytes(out), False


def _too_large(max_bytes: int, url: str) -> FetchError:
    return FetchError(
        "too_large", f"The response is larger than {max_bytes // (1024 * 1024)} MB.", url
    )


TEXT_TYPES = ("html", "xml", "json", "text/", "mpegurl", "javascript")


def _is_text(content_type: str) -> bool:
    ct = content_type.split(";", 1)[0].strip().lower()
    return not ct or any(t in ct for t in TEXT_TYPES)


def _strip_fragment(url: str) -> str:
    return url.split("#", 1)[0]


def human_error(exc: Exception) -> str:
    return exc.message if isinstance(exc, FetchError | BlockedURL) else "The request failed."
