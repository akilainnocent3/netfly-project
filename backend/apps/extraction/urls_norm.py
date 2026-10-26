"""URL normalisation for de-duplication, and "is this the same site?"."""

import ipaddress
import re
from functools import lru_cache
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlsplit, urlunsplit

import tldextract

from .models import URL_MAX

TRACKING_PARAM = re.compile(
    r"^(utm_[a-z0-9_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|igshid|mc_cid|mc_eid|_ga|_gl)$",
    re.I,
)
DEFAULT_PORTS = {"http": "80", "https": "443"}
# Characters left as they are in a path; everything else is percent-encoded (once).
_PATH_SAFE = "/:@!$&'()*+,;=-._~%"

# The bundled public-suffix snapshot only: no network, no cache directory.
_tld = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None)


def normalize(raw: str, base: str | None = None) -> str | None:
    """Absolute, canonical http(s) URL, or None for anything we don't keep.

    Resolves against `base`, drops the fragment and credentials, lowercases scheme and host,
    removes default ports, sorts the query and strips tracking parameters.
    """
    if not raw:
        return None
    raw = raw.strip().replace("\\/", "/")
    if not raw or raw.startswith(("#", "javascript:", "mailto:", "tel:", "data:", "blob:")):
        return None
    try:
        absolute = urljoin(base, raw) if base else raw
        parts = urlsplit(absolute)
        port = parts.port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    if scheme not in DEFAULT_PORTS or not parts.hostname:
        return None
    host = parts.hostname.rstrip(".").lower()
    try:
        if not _is_ip(host):
            host = host.encode("idna").decode("ascii")
    except UnicodeError:
        return None
    netloc = f"[{host}]" if ":" in host else host
    if port is not None and str(port) != DEFAULT_PORTS[scheme]:
        netloc += f":{port}"
    path = quote(unquote(_remove_dot_segments(parts.path or "/")), safe=_PATH_SAFE) or "/"
    query_items = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not TRACKING_PARAM.match(k)
    ]
    query = urlencode(sorted(query_items), doseq=True)
    url = urlunsplit((scheme, netloc, path, query, ""))
    return url if len(url) <= URL_MAX else None


def _remove_dot_segments(path: str) -> str:
    """RFC 3986 §5.2.4: /a/../b/./c → /b/c (urljoin only does it when there is a base)."""
    out: list[str] = []
    segments = path.split("/")
    for i, seg in enumerate(segments):
        if seg == "..":
            if len(out) > 1:
                out.pop()
            if i == len(segments) - 1:
                out.append("")
        elif seg == ".":
            if i == len(segments) - 1:
                out.append("")
        else:
            out.append(seg)
    result = "/".join(out)
    return result if result.startswith("/") else "/" + result


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def host_of(url: str) -> str:
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


def origin_of(url: str) -> str:
    """scheme://host[:port] (the CSP / browser notion of an origin)."""
    parts = urlsplit(url)
    host = parts.hostname or ""
    netloc = f"[{host}]" if ":" in host else host
    if parts.port and str(parts.port) != DEFAULT_PORTS.get(parts.scheme, ""):
        netloc += f":{parts.port}"
    return f"{parts.scheme}://{netloc}"


@lru_cache(maxsize=4096)
def registrable_domain(host: str) -> str:
    """example.co.uk for a.b.example.co.uk; the host itself for IPs and unknown suffixes."""
    if not host or _is_ip(host):
        return host
    result = _tld(host)
    domain = result.top_domain_under_public_suffix
    if domain:
        return domain
    # A suffix the list doesn't know (.test, .lan, intranet names): the last two labels.
    labels = host.split(".")
    return ".".join(labels[-2:]) if len(labels) >= 2 else host


def same_site(url: str, root_host: str, *, host_only: bool = False) -> bool:
    host = host_of(url)
    if host_only:
        return host == root_host
    return registrable_domain(host) == registrable_domain(root_host)
