"""Every link in an HTML page: anchors, frames, media, meta tags, JSON-LD, microdata, oEmbed
discovery, srcset, and media URLs inside scripts and data-* attributes.

Parsing only: nothing fetched is ever executed here.
"""

import json
import re
from dataclasses import dataclass, field

from selectolax.lexbor import LexborHTMLParser

from .classify import by_extension, is_player_frame
from .models import DiscoveredLink
from .urls_norm import normalize

S = DiscoveredLink.Source
K = DiscoveredLink.Kind

MEDIA_EXT = r"(?:m3u8|mpd|mp4|webm|mov|m4v)"
# Absolute or protocol-relative media URLs anywhere in script text (JSON-escaped slashes allowed).
ABS_MEDIA = re.compile(
    r"(?:https?:)?(?:\\?/){2}[^\s\"'<>()\\]+?\."
    + MEDIA_EXT
    + r"(?:\?[^\s\"'<>()\\]*)?(?=[\s\"'<>(),\\]|$)",
    re.I,
)
# Quoted relative paths: "file": "/media/movie.mp4", src: 'clip.m3u8'.
QUOTED_MEDIA = re.compile(
    r"[\"']((?:\.{0,2}/)?[\w\-./%]+\." + MEDIA_EXT + r"(?:\?[^\"'\s<>]*)?)[\"']", re.I
)
# A whole attribute value that is a media URL (absolute, protocol-relative or relative).
MEDIA_VALUE = re.compile(r"[^\s\"'<>]+\." + MEDIA_EXT + r"(?:\?[^\s\"'<>]*)?", re.I)
OEMBED_TYPES = {"application/json+oembed", "text/xml+oembed", "application/xml+oembed"}
OG_VIDEO_PROPS = {"og:video", "og:video:url", "og:video:secure_url"}
MAX_SCRIPT_CHARS = 2_000_000


@dataclass
class Found:
    url: str
    source: str
    kind: str | None = None
    meta: dict = field(default_factory=dict)


@dataclass
class ParsedPage:
    url: str
    base: str
    title: str = ""
    description: str = ""
    image: str = ""
    links: list[Found] = field(default_factory=list)
    oembed: list[str] = field(default_factory=list)
    # Structured video facts (JSON-LD / microdata / OpenGraph), keyed by the video URL.
    videos: dict[str, dict] = field(default_factory=dict)


def parse_html(html: str | bytes, page_url: str) -> ParsedPage:
    if isinstance(html, bytes):
        html = html.decode("utf-8", errors="replace")
    tree = LexborHTMLParser(html)
    base = page_url
    if (base_node := tree.css_first("base[href]")) is not None:
        base = normalize(base_node.attributes.get("href") or "", page_url) or page_url
    page = ParsedPage(url=page_url, base=base)
    seen: set[tuple[str, str]] = set()

    def add(raw: str | None, source: str, kind: str | None = None, **meta) -> str | None:
        url = normalize(raw or "", base)
        if not url or (url, source) in seen:
            return url
        seen.add((url, source))
        page.links.append(Found(url, source, kind, {k: v for k, v in meta.items() if v}))
        return url

    if (node := tree.css_first("title")) is not None:
        page.title = _clean(node.text())[:500]

    # ---- anchors and <link> ----------------------------------------------------------------
    for node in tree.css("a[href], area[href]"):
        add(node.attributes.get("href"), S.A_HREF, text=_clean(node.text())[:200])
    for node in tree.css("link[href]"):
        attrs = node.attributes
        rel = (attrs.get("rel") or "").lower().split()
        type_ = (attrs.get("type") or "").lower()
        href = attrs.get("href")
        if "alternate" in rel and type_ in OEMBED_TYPES:
            url = add(href, S.OEMBED, K.OTHER, oembed=True)
            if url and type_ == "application/json+oembed":
                page.oembed.append(url)
            continue
        if "preload" in rel and (attrs.get("as") or "").lower() == "video":
            add(href, S.LINK, K.VIDEO_FILE)
            continue
        if {
            "stylesheet",
            "icon",
            "apple-touch-icon",
            "manifest",
            "preconnect",
            "dns-prefetch",
        } & set(rel):
            add(href, S.LINK, K.OTHER if "icon" not in " ".join(rel) else K.IMAGE)
            continue
        add(href, S.LINK, None, rel=" ".join(rel))

    # ---- frames, embeds, objects --------------------------------------------------------------
    for node in tree.css("iframe[src], frame[src], embed[src], object[data]"):
        src = node.attributes.get("src") or node.attributes.get("data") or ""
        resolved = normalize(src, base) or ""
        kind = K.EMBED if is_player_frame(resolved) else K.OTHER
        add(src, S.IFRAME, kind, title=node.attributes.get("title"))

    # ---- media elements ---------------------------------------------------------------------
    for node in tree.css("video, audio"):
        attrs = node.attributes
        audio = node.tag == "audio"
        if attrs.get("src"):
            add(attrs.get("src"), S.VIDEO_SRC, K.OTHER if audio else _media_kind(attrs.get("src")))
        if attrs.get("poster"):
            add(attrs.get("poster"), S.VIDEO_SRC, K.IMAGE)
        for source in node.css("source[src]"):
            src = source.attributes.get("src")
            add(
                src,
                S.SOURCE_SRC,
                K.OTHER if audio else _media_kind(src, source.attributes.get("type")),
            )
        for track in node.css("track[src]"):
            add(track.attributes.get("src"), S.SOURCE_SRC, K.OTHER)

    # ---- images and srcset ------------------------------------------------------------------
    for node in tree.css("img[src]"):
        add(node.attributes.get("src"), S.IMG, K.IMAGE)
    for node in tree.css("img[srcset], source[srcset]"):
        for candidate in _srcset(node.attributes.get("srcset") or ""):
            add(candidate, S.SRCSET, K.IMAGE)

    # ---- meta tags (OpenGraph, Twitter) --------------------------------------------------------
    og: dict[str, str] = {}
    for node in tree.css("meta"):
        attrs = node.attributes
        key = (attrs.get("property") or attrs.get("name") or "").strip().lower()
        content = (attrs.get("content") or "").strip()
        if not key or not content:
            continue
        og.setdefault(key, content)
        if key in OG_VIDEO_PROPS:
            add(content, S.OG_VIDEO, _media_kind(content, og.get("og:video:type"), K.EMBED))
        elif key == "twitter:player":
            add(content, S.OG_VIDEO, K.EMBED)
        elif key == "twitter:player:stream":
            add(content, S.OG_VIDEO, _media_kind(content))
    page.description = (
        og.get("og:description") or og.get("description") or og.get("twitter:description") or ""
    )[:2000]
    page.image = normalize(og.get("og:image") or og.get("twitter:image") or "", base) or ""
    if not page.title:
        page.title = (og.get("og:title") or "")[:500]
    for key in OG_VIDEO_PROPS | {"twitter:player:stream", "twitter:player"}:
        if key in og and (url := normalize(og[key], base)):
            page.videos.setdefault(url, {}).update(
                _drop_empty(
                    {
                        "title": og.get("og:title"),
                        "description": page.description,
                        "thumbnail": page.image,
                        "width": _int(og.get("og:video:width") or og.get("twitter:player:width")),
                        "height": _int(
                            og.get("og:video:height") or og.get("twitter:player:height")
                        ),
                    }
                )
            )

    # ---- JSON-LD and microdata -------------------------------------------------------------------
    for node in tree.css('script[type="application/ld+json"]'):
        for video in _video_objects(_loads(node.text())):
            _add_video_object(video, add, page, base)
    for scope in tree.css('[itemtype*="schema.org/VideoObject"]'):
        props: dict = {}
        for prop in scope.css("[itemprop]"):
            name = prop.attributes.get("itemprop") or ""
            value = (
                prop.attributes.get("content")
                or prop.attributes.get("href")
                or prop.attributes.get("src")
                or _clean(prop.text())
            )
            props.setdefault(name, value)
        _add_video_object(props, add, page, base)

    # ---- scripts and data-* attributes (conservative: media extensions only) --------------------
    scope: dict[str, str] = {}  # string variables, shared by the page's inline scripts in order
    for node in tree.css("script"):
        if (node.attributes.get("type") or "").lower() == "application/ld+json":
            continue
        if node.attributes.get("src"):
            add(node.attributes.get("src"), S.SCRIPT, K.OTHER)
            continue
        text = node.text()[:MAX_SCRIPT_CHARS]
        for url in media_urls_in_text(text):
            add(url, S.SCRIPT, _media_kind(url))
        for url in provider_urls_in_text(text, page_url):
            add(url, S.SCRIPT, K.EMBED)
        for url in assembled_media_urls(text, scope):
            add(url, S.SCRIPT, _media_kind(url))
    for node in tree.css("*"):
        for name, value in (node.attributes or {}).items():
            if name.startswith("data-") and value and re.search(MEDIA_EXT, value, re.I):
                # The value itself may be the URL (data-src="/hls/master.m3u8"), or JSON config.
                bare = value.strip()
                found = [bare] if MEDIA_VALUE.fullmatch(bare) else media_urls_in_text(value)
                for url in found:
                    add(url, S.SCRIPT, _media_kind(url))
    return page


# Video pages of known providers inside script data (players and app shells list them in JSON,
# not in <a> tags). Absolute URLs anywhere; YouTube's relative /watch?v= only on YouTube itself.
PROVIDER_IN_TEXT = re.compile(
    r"https?:(?:\\?/){2}(?:(?:www|m)\.)?(?:youtube\.com/(?:watch\?v=|shorts/|embed/)[\w-]{11}"
    r"|youtu\.be/[\w-]{11}|(?:player\.)?vimeo\.com/(?:video/)?\d{5,}"
    r"|dailymotion\.com/video/[a-z0-9]{5,})",
    re.I,
)
YOUTUBE_RELATIVE = re.compile(r"(?<![\w/])/(?:watch\?v=|shorts/)[\w-]{11}")
MAX_PROVIDER_URLS = 200


def provider_urls_in_text(text: str, page_url: str) -> list[str]:
    if not text:
        return []
    text = text.replace("\\/", "/").replace("\\u0026", "&")
    found = [m.group(0) for m in PROVIDER_IN_TEXT.finditer(text)]
    host = (page_url.split("/")[2] if "://" in page_url else "").lower()
    if host.endswith("youtube.com"):
        found += ["https://www.youtube.com" + m.group(0) for m in YOUTUBE_RELATIVE.finditer(text)]
    return list(dict.fromkeys(found))[:MAX_PROVIDER_URLS]


# Player sources assembled from string pieces: var d1 = "http://host/hls/"; var d3 = ".m3u8";
# source: d1 + d2 + d3. Constant folding over string literals only — nothing is executed.
_STR = r"\"(?:[^\"\\\n]|\\.)*\"|'(?:[^'\\\n]|\\.)*'"
_IDENT = r"[A-Za-z_$][\w$]*"
_TERM = rf"(?:{_STR}|{_IDENT})"
_ASSIGN = re.compile(
    rf"(?:\b(?:var|let|const)\s+)?({_IDENT})\s*=\s*({_TERM}(?:\s*\+\s*{_TERM})*)\s*(?=[;,\n\]}})])"
)
_CONCAT = re.compile(rf"{_TERM}(?:\s*\+\s*{_TERM})+")
_TEMPLATE = re.compile(r"`([^`\\]{0,2048})`")
_TERM_RE = re.compile(_TERM)
MAX_SCOPE = 2000


def _fold(expr: str, scope: dict[str, str]) -> str | None:
    """The value of `"a" + b + 'c'` when every name is a known string, else None."""
    out = []
    for term in _TERM_RE.findall(expr):
        if term[0] in "\"'":
            out.append(term[1:-1].replace("\\/", "/").replace("\\" + term[0], term[0]))
        elif term in scope:
            out.append(scope[term])
        else:
            return None
    value = "".join(out)
    return value if len(value) <= 2048 else None


def assembled_media_urls(text: str, scope: dict[str, str]) -> list[str]:
    if not text:
        return []
    for _ in range(2):  # a second pass resolves names assigned from names defined later
        for name, expr in _ASSIGN.findall(text):
            if len(scope) >= MAX_SCOPE and name not in scope:
                break
            if (value := _fold(expr, scope)) is not None:
                scope[name] = value
    found = [v for v in (_fold(m.group(0), scope) for m in _CONCAT.finditer(text)) if v]
    for m in _TEMPLATE.finditer(text):
        body = m.group(1)
        names = re.findall(r"\$\{\s*(" + _IDENT + r")\s*\}", body)
        if names and all(n in scope for n in names):
            found.append(
                re.sub(r"\$\{\s*(" + _IDENT + r")\s*\}", lambda x: scope[x.group(1)], body)
            )
    found += [v for v in scope.values()]
    urls: list[str] = []
    for value in found:
        bare = value.strip()
        if MEDIA_VALUE.fullmatch(bare) and bare not in urls:
            urls.append(bare)
    return urls


def media_urls_in_text(text: str) -> list[str]:
    if not text:
        return []
    text = text.replace("\\/", "/").replace("\\u002F", "/").replace("\\u002f", "/")
    found = [m.group(0) for m in ABS_MEDIA.finditer(text)]
    found += [m.group(1) for m in QUOTED_MEDIA.finditer(text)]
    out, seen = [], set()
    for url in found:
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def _media_kind(
    url: str | None, type_: str | None = None, default: str | None = None
) -> str | None:
    t = (type_ or "").lower()
    if "mpegurl" in t or "dash" in t:
        return K.STREAM
    if t.startswith("video/"):
        return K.VIDEO_FILE
    kind = by_extension(url or "")
    if kind in (K.VIDEO_FILE, K.STREAM, K.EMBED):
        return kind
    return default or kind or K.VIDEO_FILE


def _srcset(value: str) -> list[str]:
    out = []
    for part in value.split(","):
        url = part.strip().split(" ", 1)[0]
        if url:
            out.append(url)
    return out


def _clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _loads(text: str):
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return None


def _video_objects(data) -> list[dict]:
    """Every VideoObject in a JSON-LD document (top level, @graph, nested values)."""
    found: list[dict] = []

    def walk(node, depth=0):
        if depth > 8:
            return
        if isinstance(node, list):
            for item in node:
                walk(item, depth + 1)
        elif isinstance(node, dict):
            types = node.get("@type")
            types = types if isinstance(types, list) else [types]
            if any(isinstance(t, str) and t.lower().endswith("videoobject") for t in types):
                found.append(node)
            for value in node.values():
                if isinstance(value, dict | list):
                    walk(value, depth + 1)

    walk(data)
    return found


def _first(value):
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("url") or value.get("@id") or value.get("contentUrl")
    return value if isinstance(value, str) else None


def _add_video_object(video: dict, add, page: ParsedPage, base: str) -> None:
    meta = _drop_empty(
        {
            "title": _first(video.get("name")),
            "description": _first(video.get("description")),
            "thumbnail": normalize(_first(video.get("thumbnailUrl")) or "", base),
            "duration": parse_iso_duration(_first(video.get("duration"))),
            "width": _int(_first(video.get("width"))),
            "height": _int(_first(video.get("height"))),
        }
    )
    content = add(
        _first(video.get("contentUrl")),
        S.JSON_LD,
        _media_kind(_first(video.get("contentUrl"))),
        **meta,
    )
    embed = add(_first(video.get("embedUrl")), S.JSON_LD, K.EMBED, **meta)
    if meta.get("thumbnail"):
        add(meta["thumbnail"], S.JSON_LD, K.IMAGE)
    for url in (content, embed):
        if url:
            page.videos.setdefault(url, {}).update(meta)


DURATION = re.compile(
    r"^P(?:(?P<d>\d+(?:\.\d+)?)D)?(?:T(?:(?P<h>\d+(?:\.\d+)?)H)?(?:(?P<m>\d+(?:\.\d+)?)M)?(?:(?P<s>\d+(?:\.\d+)?)S)?)?$",
    re.I,
)


def parse_iso_duration(value: str | None) -> float | None:
    """PT1H42M10S → 6130.0"""
    if not value:
        return None
    match = DURATION.match(value.strip())
    if not match or not any(match.groupdict().values()):
        try:
            return float(value)
        except ValueError:
            return None
    g = {k: float(v) if v else 0.0 for k, v in match.groupdict().items()}
    return g["d"] * 86400 + g["h"] * 3600 + g["m"] * 60 + g["s"]


def _int(value) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _drop_empty(d: dict) -> dict:
    return {k: v for k, v in d.items() if v not in (None, "", 0)}
