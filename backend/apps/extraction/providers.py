"""Known video providers: their official oEmbed endpoints (preferred, decision 70) and players."""

import json
import re
from urllib.parse import parse_qs, quote, urlsplit

from apps.core.config import config

from .classify import provider_for
from .fetch import Fetcher, FetchError
from .sanitize import build_iframe, iframe_src_allowed, sanitize_embed_html
from .urls_norm import host_of, registrable_domain

GRAPH = "https://graph.facebook.com/v19.0"
OEMBED = {
    "YouTube": "https://www.youtube.com/oembed?format=json&url={url}",
    "Vimeo": "https://vimeo.com/api/oembed.json?url={url}",
    "Dailymotion": "https://www.dailymotion.com/services/oembed?format=json&url={url}",
    "Wistia": "https://fast.wistia.com/oembed?url={url}",
    "Facebook": GRAPH + "/oembed_video?url={url}&access_token={token}",
    "Instagram": GRAPH + "/instagram_oembed?url={url}&access_token={token}",
    "TikTok": "https://www.tiktok.com/oembed?url={url}",
    "Streamable": "https://api.streamable.com/oembed.json?url={url}",
    "SoundCloud": "https://soundcloud.com/oembed?format=json&url={url}",
}
NEEDS_TOKEN = {"Facebook", "Instagram"}


def canonical_page(provider: str, url: str) -> str:
    """The provider's watch-page URL for a player/embed URL (oEmbed wants the page)."""
    parts = urlsplit(url)
    path = parts.path
    if provider == "YouTube":
        if m := re.match(r"^/(?:embed|shorts|live|v)/([\w-]{6,})", path):
            return f"https://www.youtube.com/watch?v={m.group(1)}"
        if parts.hostname and parts.hostname.endswith("youtu.be"):
            return f"https://www.youtube.com/watch?v={path.strip('/')}"
    if provider == "Vimeo" and (m := re.match(r"^/video/(\d+)", path)):
        return f"https://vimeo.com/{m.group(1)}"
    if provider == "Dailymotion" and (m := re.match(r"^/embed/video/(\w+)", path)):
        return f"https://www.dailymotion.com/video/{m.group(1)}"
    return url


def twitch_embed(url: str, parents: list[str]) -> str | None:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    query = parse_qs(parts.query)
    parent = "".join(f"&parent={quote(p)}" for p in parents) or "&parent=localhost"
    if host.startswith("clips.") or "/clip/" in parts.path:
        clip = query.get("clip", [parts.path.rstrip("/").rsplit("/", 1)[-1]])[0]
        return f"https://clips.twitch.tv/embed?clip={quote(clip)}{parent}"
    if host.startswith("player."):
        return url
    if m := re.match(r"^/videos/(\d+)", parts.path):
        return f"https://player.twitch.tv/?video={m.group(1)}{parent}"
    channel = parts.path.strip("/").split("/", 1)[0]
    if channel:
        return f"https://player.twitch.tv/?channel={quote(channel)}{parent}"
    return None


def oembed_endpoint(provider: str, url: str) -> str | None:
    template = OEMBED.get(provider)
    if not template:
        return None
    token = config.get_secret("extraction.facebook_app_token") if provider in NEEDS_TOKEN else ""
    if provider in NEEDS_TOKEN and not token:
        return None
    return template.format(url=quote(url, safe=""), token=quote(token, safe=""))


def check_provider(
    url: str,
    fetcher: Fetcher,
    *,
    parents: list[str],
    endpoint: str | None = None,
    page_url: str = "",
) -> dict:
    """A provider_embed video entry (see checks.video_entry) for `url`.

    `endpoint` is an oEmbed URL discovered in a page (<link rel="alternate" …+oembed>); its
    iframe may also come from the page's or the endpoint's own site.
    """
    provider = provider_for(url) or (host_of(endpoint or url) if endpoint else "")
    entry = {
        "kind": "provider_embed",
        "url": url,
        "provider": provider,
        "title": "",
        "description": "",
        "thumbnail": "",
        "duration": None,
        "width": None,
        "height": None,
        "playable_in_netfly": {"verdict": "unknown", "reasons": []},
        "embed": None,
        "origins": [],
    }
    reasons = entry["playable_in_netfly"]["reasons"]
    if provider == "Twitch":
        src = twitch_embed(url, parents)
        if src:
            entry["embed"] = {
                "type": "iframe",
                "src": src,
                "html": build_iframe(src, title="Twitch"),
            }
            entry["playable_in_netfly"] = {
                "verdict": "yes",
                "reasons": [
                    "Embeddable via Twitch's official player (parent set to NETFLY's domains)."
                ],
            }
        return entry
    if provider == "JW Player":
        src = url if "/players/" in url else None
        if src and iframe_src_allowed(src):
            entry["embed"] = {
                "type": "iframe",
                "src": src,
                "html": build_iframe(src, title="JW Player"),
            }
            entry["playable_in_netfly"] = {
                "verdict": "yes",
                "reasons": ["Embeddable via JW Player's hosted player."],
            }
        else:
            reasons.append(
                "JW Player media without a hosted player URL — open the page that embeds it."
            )
        return entry

    page = canonical_page(provider, url) if provider else url
    endpoint = endpoint or oembed_endpoint(provider, page)
    if not endpoint:
        if provider in NEEDS_TOKEN:
            reasons.append(
                f"Needs a provider token: add a Facebook app token in Settings → Video extraction to check {provider} videos."
            )
        else:
            reasons.append("No oEmbed endpoint is known for this player.")
        return entry
    try:
        result = fetcher.fetch(
            endpoint, headers={"Accept": "application/json"}, max_bytes=1024 * 1024
        )
    except FetchError as exc:
        reasons.append(f"{provider or 'The provider'} didn't answer: {exc.message}")
        return entry
    if result.status in (401, 403):
        entry["playable_in_netfly"] = {
            "verdict": "no",
            "reasons": [
                f"Blocked: {provider or 'the provider'} says embedding is disabled by the owner or the video is private (HTTP {result.status})."
            ],
        }
        return entry
    if result.status == 404:
        entry["playable_in_netfly"] = {
            "verdict": "no",
            "reasons": [
                "The provider doesn't know this video (deleted, private or not a video page)."
            ],
        }
        return entry
    if result.status >= 400:
        reasons.append(f"The provider's oEmbed answered HTTP {result.status}.")
        return entry
    try:
        data = json.loads(result.body)
    except ValueError:
        reasons.append("The provider's oEmbed answer wasn't JSON.")
        return entry
    if not isinstance(data, dict):
        reasons.append("The provider's oEmbed answer wasn't understood.")
        return entry
    entry["provider"] = str(data.get("provider_name") or provider or host_of(endpoint))[:100]
    entry["title"] = str(data.get("title") or "")[:300]
    entry["description"] = str(data.get("description") or "")[:2000]
    entry["thumbnail"] = str(data.get("thumbnail_url") or "")
    entry["width"] = _int(data.get("width"))
    entry["height"] = _int(data.get("height"))
    entry["duration"] = _float(data.get("duration"))
    extra = {registrable_domain(host_of(endpoint))}
    if page_url:
        extra.add(registrable_domain(host_of(page_url)))
    extra_hosts = {h for h in extra if h}
    clean = sanitize_embed_html(str(data.get("html") or ""), _hosts_under(extra_hosts, data))
    if clean is None and provider == "TikTok" and (m := re.search(r"/video/(\d+)", url)):
        src = f"https://www.tiktok.com/embed/v2/{m.group(1)}"
        clean = (build_iframe(src, title=entry["title"]), src)
    if clean is None:
        entry["playable_in_netfly"] = {
            "verdict": "unknown",
            "reasons": [
                "The provider's embed code isn't a single iframe from a known player, so NETFLY won't use it."
            ],
        }
        return entry
    html, src = clean
    entry["embed"] = {"type": "oembed", "src": src, "html": html}
    name = entry["provider"] or "the provider"
    entry["playable_in_netfly"] = {
        "verdict": "yes",
        "reasons": [f"Embeddable via {name}'s official player."],
    }
    if str(data.get("type") or "") == "rich" and provider == "SoundCloud":
        entry["playable_in_netfly"]["reasons"].append("Audio only.")
    return entry


def _hosts_under(domains: set[str], data: dict) -> set[str]:
    """Hosts of the oEmbed iframe that sit under the page's/endpoint's own domain."""
    html = str(data.get("html") or "")
    m = re.search(r"src=[\"']([^\"']+)", html)
    host = host_of(m.group(1)) if m else ""
    return {host} if host and registrable_domain(host) in domains else set()


def _int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
