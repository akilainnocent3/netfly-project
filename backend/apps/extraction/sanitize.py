"""Provider embed HTML → exactly one iframe from an allowed host, rebuilt from scratch.

Nothing from the provider's markup survives except the iframe's whitelisted attributes, so a
script, an event handler or a second element can never reach Studio or (later) the client.
"""

from html import escape
from urllib.parse import urlsplit

from selectolax.lexbor import LexborHTMLParser

from apps.core.config import config

from .safety import test_hosts

DEFAULT_EMBED_HOSTS = [
    "www.youtube.com",
    "www.youtube-nocookie.com",
    "player.vimeo.com",
    "www.dailymotion.com",
    "geo.dailymotion.com",
    "fast.wistia.net",
    "fast.wistia.com",
    "cdn.jwplayer.com",
    "content.jwplatform.com",
    "www.facebook.com",
    "www.instagram.com",
    "www.tiktok.com",
    "player.twitch.tv",
    "clips.twitch.tv",
    "streamable.com",
    "w.soundcloud.com",
]
ALLOWED_FEATURES = {
    "autoplay",
    "fullscreen",
    "picture-in-picture",
    "encrypted-media",
    "accelerometer",
    "gyroscope",
    "clipboard-write",
    "web-share",
}
ALLOWED_REFERRER = {
    "no-referrer",
    "origin",
    "strict-origin",
    "strict-origin-when-cross-origin",
    "no-referrer-when-downgrade",
}


def embed_hosts() -> set[str]:
    hosts = config.get_json("extraction.embed_hosts", DEFAULT_EMBED_HOSTS) or DEFAULT_EMBED_HOSTS
    return {str(h).lower() for h in hosts}


def iframe_src_allowed(src: str, extra_hosts: set[str] | None = None) -> bool:
    try:
        parts = urlsplit(src)
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    if not host or parts.username or parts.password:
        return False
    if parts.scheme != "https":
        # Plain http only for the e2e fixture site (test mode's allow-list).
        port = parts.port or 80
        return parts.scheme == "http" and f"{host}:{port}" in test_hosts()
    return host in embed_hosts() or host in (extra_hosts or set())


def build_iframe(src: str, *, title: str = "", width=None, height=None) -> str:
    attrs = [
        f'src="{escape(src, quote=True)}"',
        f'title="{escape(title or "Embedded video", quote=True)}"',
        'allow="autoplay; fullscreen; picture-in-picture; encrypted-media"',
        "allowfullscreen",
        'referrerpolicy="strict-origin-when-cross-origin"',
        'loading="lazy"',
    ]
    for name, value in (("width", width), ("height", height)):
        if isinstance(value, int) or (isinstance(value, str) and value.isdigit()):
            attrs.append(f'{name}="{int(value)}"')
    return f"<iframe {' '.join(attrs)}></iframe>"


def sanitize_embed_html(html: str, extra_hosts: set[str] | None = None) -> tuple[str, str] | None:
    """(clean_html, src) when `html` holds exactly one iframe from an allowed host, else None."""
    if not html or len(html) > 20000:
        return None
    tree = LexborHTMLParser(html)
    frames = tree.css("iframe")
    if len(frames) != 1:
        return None
    attrs = frames[0].attributes
    src = (attrs.get("src") or "").strip()
    if src.startswith("//"):
        src = "https:" + src
    if not iframe_src_allowed(src, extra_hosts):
        return None
    features = [
        f.strip()
        for f in (attrs.get("allow") or "").split(";")
        if f.strip().split(" ", 1)[0] in ALLOWED_FEATURES
    ]
    out = [f'src="{escape(src, quote=True)}"']
    if title := (attrs.get("title") or "").strip():
        out.append(f'title="{escape(title[:200], quote=True)}"')
    for name in ("width", "height"):
        value = (attrs.get(name) or "").strip().rstrip("px")
        if value.isdigit() and int(value) <= 4096:
            out.append(f'{name}="{int(value)}"')
    if features:
        out.append(f'allow="{escape("; ".join(f.split(" ", 1)[0] for f in features), quote=True)}"')
    if "allowfullscreen" in attrs:
        out.append("allowfullscreen")
    referrer = (attrs.get("referrerpolicy") or "").strip().lower()
    out.append(
        f'referrerpolicy="{referrer if referrer in ALLOWED_REFERRER else "strict-origin-when-cross-origin"}"'
    )
    out.append('loading="lazy"')
    return f"<iframe {' '.join(out)}></iframe>", src
