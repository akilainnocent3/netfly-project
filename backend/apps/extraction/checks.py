"""Checking one link: can the page be embedded, does it contain a video, can that video play?

The result (stored in DiscoveredLink.check_result) is the source of truth Studio shows; the live
preview only confirms it visually (decision 68).
"""

import base64
import datetime as dt
import io
import json
import logging
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit

from defusedxml import ElementTree
from PIL import Image

from apps.core.config import config

from . import classify
from .classify import provider_for
from .fetch import Fetcher, FetchError, FetchResult
from .framing import client_origins, evaluate_framing
from .models import DiscoveredLink
from .parse import parse_html, parse_iso_duration
from .providers import check_provider
from .sanitize import build_iframe
from .urls_norm import host_of, normalize, origin_of

logger = logging.getLogger(__name__)

K = DiscoveredLink.Kind
S = DiscoveredLink.Source
YES, NO, UNKNOWN = "yes", "no", "unknown"
MAX_VIDEOS = 6
PROBE_BYTES = 4 * 1024 * 1024
BROWSER_VIDEO_CODECS = {"h264", "vp8", "vp9", "av1"}
BROWSER_AUDIO_CODECS = {"aac", "mp3", "opus", "vorbis", "flac"}
DRM_KEYFORMATS = (
    "com.apple.streamingkeydelivery",
    "edef8ba9-79d6-4ace-a3c8-27dcd51d21ed",  # Widevine
    "9a04f079-9840-4286-ab92-e65be0885f95",  # PlayReady
    "com.microsoft.playready",
)


def run_check(url: str, *, fetcher: Fetcher | None = None) -> dict:
    own = fetcher is None
    fetcher = fetcher or Fetcher()
    try:
        return _run(url, fetcher)
    finally:
        if own:
            fetcher.close()


def _run(url: str, fetcher: Fetcher) -> dict:
    origins = client_origins()
    result = {
        "reachable": False,
        "final_url": url,
        "http_status": None,
        "content_type": "",
        "redirects": [],
        "link_kind": classify.by_extension(url) or K.PAGE,
        "title": "",
        "description": "",
        "thumbnail": "",
        "page_embeddable": {"verdict": UNKNOWN, "reasons": [], "notes": []},
        "videos": [],
        "recommended": None,
        "client_origins": origins,
        "checked_at": dt.datetime.now(dt.UTC).isoformat(),
    }
    try:
        res = fetcher.fetch(url, probe_media=True)
    except FetchError as exc:
        result["page_embeddable"]["reasons"] = [exc.message]
        result["error"] = exc.message
        return result
    result.update(
        reachable=res.status < 400,
        final_url=res.final_url,
        http_status=res.status,
        content_type=res.content_type,
        redirects=res.redirects,
    )
    kind = (
        classify.by_content_type(res.content_type)
        or classify.sniff(res.body[:2048])
        or classify.by_extension(res.final_url)
        or K.OTHER
    )
    if kind == K.OTHER and classify.by_extension(url) in (K.VIDEO_FILE, K.STREAM):
        kind = classify.by_extension(url)
    result["link_kind"] = kind

    if kind == K.PAGE:
        framing = evaluate_framing(
            res.final_url, res.status, res.headers, origins=origins, body=res.body
        )
        result["page_embeddable"] = {k: framing[k] for k in ("verdict", "reasons", "notes")}
        candidates = []
        if res.status < 400:
            page = parse_html(res.text(), normalize(res.final_url) or res.final_url)
            result.update(title=page.title, description=page.description, thumbnail=page.image)
            candidates = _candidates(url, page)
        elif provider_for(url):
            candidates = [("provider", url, {}, "")]
        result["videos"] = [
            v
            for v in (_check_candidate(c, fetcher, origins, res.final_url) for c in candidates)
            if v
        ]
    else:
        result["page_embeddable"] = {
            "verdict": UNKNOWN,
            "reasons": ["This link is a media file, not a web page — see the video below."],
            "notes": [],
        }
        if kind == K.VIDEO_FILE:
            result["videos"] = [check_file(res.final_url, fetcher, origins)]
        elif kind == K.STREAM:
            result["videos"] = [check_stream(res.final_url, fetcher, origins, res)]
    result["recommended"] = recommend(result)
    attach_thumbnails(result, fetcher)
    return result


def _candidates(url: str, page) -> list[tuple[str, str, dict, str]]:
    """(how, url, facts, endpoint) for every video-like thing on the page, best first."""
    out: list[tuple[str, str, dict, str]] = []
    seen: set[str] = set()

    def push(how, target, endpoint=""):
        if target in seen or len(out) >= MAX_VIDEOS:
            return
        seen.add(target)
        out.append((how, target, page.videos.get(target, {}), endpoint))

    if provider_for(url):
        push("provider", url)
    for endpoint in page.oembed:
        push("oembed", endpoint, endpoint)
    media_sources = {S.IFRAME, S.OG_VIDEO, S.JSON_LD, S.VIDEO_SRC, S.SOURCE_SRC, S.SCRIPT, S.LINK}
    for found in page.links:
        if found.source not in media_sources:
            continue
        kind = found.kind or classify.by_extension(found.url)
        if provider_for(found.url):
            push("provider", found.url)
        elif kind == K.EMBED:
            push("iframe", found.url)
        elif kind in (K.VIDEO_FILE, K.STREAM):
            push("media", found.url)
    return out


def _check_candidate(candidate, fetcher, origins, page_url) -> dict | None:
    how, url, facts, endpoint = candidate
    parents = [host_of(o) for o in origins]
    try:
        if how == "provider":
            entry = check_provider(url, fetcher, parents=parents, page_url=page_url)
        elif how == "oembed":
            entry = check_provider(
                page_url, fetcher, parents=parents, endpoint=endpoint, page_url=page_url
            )
            entry["url"] = page_url
        elif how == "iframe":
            entry = check_player_page(url, fetcher, origins)
            if entry is None:
                return None
        else:
            kind = classify.by_extension(url)
            entry = (
                check_stream(url, fetcher, origins)
                if kind == K.STREAM
                else check_file(url, fetcher, origins)
            )
    except FetchError as exc:
        entry = _entry("file", url)
        entry["playable_in_netfly"]["reasons"].append(exc.message)
    except Exception:  # noqa: BLE001 - one odd video never breaks the whole check
        logger.exception("check of %s failed", url)
        return None
    for key in ("title", "description", "thumbnail", "duration", "width", "height"):
        if not entry.get(key) and facts.get(key):
            entry[key] = facts[key]
    return entry


def _entry(kind: str, url: str, provider: str = "") -> dict:
    return {
        "kind": kind,
        "url": url,
        "provider": provider,
        "title": "",
        "description": "",
        "thumbnail": "",
        "duration": None,
        "width": None,
        "height": None,
        "playable_in_netfly": {"verdict": UNKNOWN, "reasons": []},
        "embed": None,
        "origins": [],
    }


THUMB_BYTES = 3 * 1024 * 1024
THUMB_SIZE = (320, 180)


def thumbnail_data_uri(url: str, fetcher: Fetcher) -> str:
    """A small JPEG data: URI of an image, fetched server-side (Studio's CSP stays closed to
    image hosts, and staff browsers never contact them). "" when it isn't a usable image."""
    if not url or not url.startswith(("http://", "https://")):
        return ""
    try:
        res = fetcher.fetch(url, headers={"Accept": "image/*"}, max_bytes=THUMB_BYTES)
    except FetchError:
        return ""
    if res.status >= 400 or not res.body:
        return ""
    try:
        with Image.open(io.BytesIO(res.body)) as img:
            if img.width * img.height > 40_000_000:
                return ""
            img.draft("RGB", (THUMB_SIZE[0] * 2, THUMB_SIZE[1] * 2))
            img = img.convert("RGB")
            img.thumbnail(THUMB_SIZE)
            out = io.BytesIO()
            img.save(out, "JPEG", quality=72, optimize=True)
    except (OSError, ValueError, Image.DecompressionBombError):
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


def attach_thumbnails(result: dict, fetcher: Fetcher) -> None:
    cache: dict[str, str] = {}

    def data(url: str) -> str:
        if url not in cache:
            cache[url] = thumbnail_data_uri(url, fetcher)
        return cache[url]

    result["thumbnail_data"] = data(result.get("thumbnail") or "")
    for video in result["videos"]:
        video["thumbnail_data"] = data(video.get("thumbnail") or "")


def recommend(result: dict):
    order = {"provider_embed": 0, "hls": 1, "file": 2, "dash": 3}
    playable = [
        (order.get(v["kind"], 9), i)
        for i, v in enumerate(result["videos"])
        if v["playable_in_netfly"]["verdict"] == YES and v.get("embed")
    ]
    if playable:
        return min(playable)[1]
    if result["page_embeddable"]["verdict"] == YES:
        return "page"
    return None


# ---- players we don't know: is the player page itself frameable? ---------------------------


PLAYER_HINTS = re.compile(
    rb"<video\b|jwplayer\(|videojs|video-js|plyr|flowplayer|shaka-player|hls\.js|dash\.js|"
    rb"bitmovin|theoplayer|clappr|mediaelement",
    re.I,
)
VIDEO_SOURCES = {S.VIDEO_SRC, S.SOURCE_SRC, S.OG_VIDEO, S.JSON_LD, S.SCRIPT, S.OEMBED}


def check_player_page(url: str, fetcher: Fetcher, origins: list[str]) -> dict | None:
    """A frame from a host we don't know. Only a page that shows signs of a video player counts
    (a tag manager's or a captcha's iframe is not a video); None otherwise."""
    res = fetcher.fetch(url, probe_media=True)
    kind = classify.by_content_type(res.content_type) or classify.sniff(res.body[:2048])
    if kind == K.VIDEO_FILE:
        return check_file(res.final_url, fetcher, origins)
    if kind == K.STREAM:
        return check_stream(res.final_url, fetcher, origins, res)
    entry = _entry("provider_embed", url, host_of(url))
    if res.status < 400 and kind == K.PAGE:
        page = parse_html(res.text(), normalize(res.final_url) or res.final_url)
        evidence = (
            PLAYER_HINTS.search(res.body)
            or page.oembed
            or any(
                f.source in VIDEO_SOURCES and f.kind in DiscoveredLink.VIDEO_KINDS
                for f in page.links
            )
        )
        if not evidence:
            return None
        entry["title"] = page.title
        entry["thumbnail"] = page.image
    framing = evaluate_framing(
        res.final_url, res.status, res.headers, origins=origins, body=res.body
    )
    entry["playable_in_netfly"] = {"verdict": framing["verdict"], "reasons": framing["reasons"]}
    if framing["verdict"] == YES:
        src = res.final_url
        entry["embed"] = {
            "type": "iframe",
            "src": src,
            "html": build_iframe(src, title=entry["title"]),
        }
        entry["origins"] = [origin_of(src)]
        entry["playable_in_netfly"]["reasons"] = [
            f"Embeddable: {host_of(src)}'s player page allows framing."
        ]
    return entry


# ---- direct files ----------------------------------------------------------------------------


def _primary(origins: list[str]) -> str:
    return origins[0] if origins else ""


def _cors_ok(res: FetchResult, origin: str) -> bool:
    allowed = (res.headers.get("access-control-allow-origin") or "").strip()
    return allowed == "*" or (bool(origin) and allowed.rstrip("/") == origin)


def _total_size(res: FetchResult) -> int | None:
    rng = res.headers.get("content-range") or ""
    if "/" in rng and (total := rng.rsplit("/", 1)[-1]).isdigit():
        return int(total)
    length = res.headers.get("content-length") or ""
    return int(length) if length.isdigit() and res.status == 200 else None


def check_file(url: str, fetcher: Fetcher, origins: list[str]) -> dict:
    entry = _entry("file", url)
    verdict = entry["playable_in_netfly"]
    origin = _primary(origins)
    site = config.get_str("seo.site_url").rstrip("/") or origin
    first_kb = {"Range": "bytes=0-1023"}
    with_ref = fetcher.fetch(
        url, headers={**first_kb, "Origin": origin, "Referer": f"{site}/"}, read_limit=1024
    )
    without_ref = fetcher.fetch(url, headers=first_kb, read_limit=1024)
    final = with_ref.final_url
    entry["url"] = final
    if with_ref.status >= 400:
        if without_ref.status < 400:
            verdict.update(
                verdict=NO,
                reasons=[
                    f"Blocked: the site rejects requests coming from NETFLY (hotlink protection, HTTP {with_ref.status})."
                ],
            )
        else:
            verdict.update(
                verdict=NO, reasons=[f"The file isn't reachable (HTTP {with_ref.status})."]
            )
        return entry
    content_type = with_ref.content_type
    sniffed = classify.sniff(with_ref.body)
    if not (content_type.startswith("video/") or sniffed == K.VIDEO_FILE):
        verdict.update(
            verdict=NO, reasons=[f"Not a video file (Content-Type: {content_type or 'none'})."]
        )
        return entry
    ranges = (
        with_ref.status == 206 or (with_ref.headers.get("accept-ranges") or "").lower() == "bytes"
    )
    cors = _cors_ok(with_ref, origin)
    size = _total_size(with_ref)
    entry["size"] = size
    entry["accept_ranges"] = ranges
    entry["cors"] = cors
    entry["origins"] = [origin_of(final)]
    entry["embed"] = {"type": "mp4", "src": final}
    container = _container(content_type, final)

    probe = probe_media(final, fetcher, size, ranges)
    if probe:
        entry.update({k: probe[k] for k in ("duration", "width", "height") if probe.get(k)})
        entry["codecs"] = {"video": probe.get("video_codec"), "audio": probe.get("audio_codec")}

    blockers, warnings = [], []
    if final.startswith("http://") and origin.startswith("https://"):
        blockers.append("Plain http file: an https NETFLY page can't play it (mixed content).")
    if expires := expiry_of(final):
        blockers.append(f"Temporary link — will stop working ({expires}).")
    if probe and probe.get("video_codec") and probe["video_codec"] not in BROWSER_VIDEO_CODECS:
        if probe["video_codec"] == "hevc":
            warnings.append("HEVC video plays only in Safari and some Chrome builds.")
        else:
            blockers.append(f"Browsers can't decode {probe['video_codec']} video.")
    if probe and probe.get("audio_codec") and probe["audio_codec"] not in BROWSER_AUDIO_CODECS:
        warnings.append(
            f"Browsers can't decode {probe['audio_codec']} audio; it may play silently."
        )
    if not ranges:
        warnings.append("No range requests: viewers can't seek.")
    if not cors:
        warnings.append(
            "No CORS for NETFLY: it plays, but scripts can't read it (no thumbnails or captions from it)."
        )
    if probe is None:
        warnings.append("Codec not checked (ffprobe isn't available on the extraction worker).")

    facts = [container]
    if entry.get("height"):
        facts.append(f"{entry['height']}p")
    if entry.get("duration"):
        facts.append(clock(entry["duration"]))
    good = []
    if cors:
        good.append("CORS allowed")
    if ranges:
        good.append("range requests supported")
    if blockers:
        verdict.update(
            verdict=NO,
            reasons=[f"Direct {', '.join(facts)} — doesn't play in NETFLY.", *blockers, *warnings],
        )
    else:
        summary = f"Direct {', '.join(facts)} — plays in NETFLY"
        summary += f" ({', '.join(good)})." if good else "."
        verdict.update(verdict=YES, reasons=[summary, *warnings])
    return entry


def _container(content_type: str, url: str) -> str:
    ext = classify.extension(url).lstrip(".").upper()
    if ext in ("MP4", "WEBM", "MOV", "M4V", "MKV", "OGV"):
        return ext
    sub = content_type.split("/", 1)[-1].upper() if "/" in content_type else ""
    return {"QUICKTIME": "MOV"}.get(sub, sub or "video")


def clock(seconds: float) -> str:
    seconds = int(round(seconds))
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def ffprobe_path() -> str | None:
    configured = config.get_str("transcoding.ffprobe_path")
    return shutil.which(configured or "ffprobe")


def probe_media(url: str, fetcher: Fetcher, size: int | None, ranges: bool) -> dict | None:
    """Codec, resolution and duration with ffprobe on a sparse local copy (start + end of the
    file), so ffprobe never opens a network connection of its own and big files cost ~8 MB."""
    ffprobe = ffprobe_path()
    if not ffprobe:
        return None
    with tempfile.TemporaryDirectory(prefix="netfly-probe-") as tmp:
        path = Path(tmp) / "media"
        head = fetcher.fetch(
            url, headers={"Range": f"bytes=0-{PROBE_BYTES - 1}"}, read_limit=PROBE_BYTES
        )
        with path.open("wb") as f:
            f.write(head.body)
            if size and ranges and size > len(head.body):
                start = max(len(head.body), size - PROBE_BYTES)
                tail = fetcher.fetch(
                    url, headers={"Range": f"bytes={start}-{size - 1}"}, read_limit=PROBE_BYTES
                )
                if tail.status == 206:
                    f.seek(start)
                    f.write(tail.body)
                f.truncate(size)
        try:
            out = subprocess.run(
                [
                    ffprobe,
                    "-v",
                    "error",
                    "-protocol_whitelist",
                    "file",
                    "-print_format",
                    "json",
                    "-show_format",
                    "-show_streams",
                    str(path),
                ],
                capture_output=True,
                timeout=20,
                check=False,
            )
            data = json.loads(out.stdout or b"{}")
        except (subprocess.TimeoutExpired, ValueError, OSError):
            return {}
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    duration = None
    for value in ((data.get("format") or {}).get("duration"), video.get("duration")):
        try:
            duration = float(value)
            break
        except (TypeError, ValueError):
            continue
    return {
        "video_codec": video.get("codec_name"),
        "audio_codec": audio.get("codec_name"),
        "width": video.get("width"),
        "height": video.get("height"),
        "duration": duration,
    }


# ---- streams (HLS / DASH) ------------------------------------------------------------------------


def check_stream(
    url: str, fetcher: Fetcher, origins: list[str], first: FetchResult | None = None
) -> dict:
    origin = _primary(origins)
    res = first
    if res is None or not res.body or res.truncated:
        res = fetcher.fetch(url, headers={"Origin": origin}, max_bytes=2 * 1024 * 1024)
    elif "access-control-allow-origin" not in res.headers and origin:
        res = fetcher.fetch(url, headers={"Origin": origin}, max_bytes=2 * 1024 * 1024)
    text = res.text().lstrip("﻿")
    if text.lstrip().startswith("#EXTM3U"):
        return check_hls(res, text, fetcher, origins)
    if "<MPD" in text[:4096]:
        return check_dash(res, text)
    entry = _entry("hls", url)
    entry["playable_in_netfly"].update(
        verdict=NO,
        reasons=[
            f"Not a playable stream manifest (HTTP {res.status}, {res.content_type or 'no type'})."
        ],
    )
    return entry


def _attrs(line: str) -> dict[str, str]:
    out = {}
    for m in re.finditer(r'([A-Z0-9-]+)=("[^"]*"|[^",]*)', line.split(":", 1)[-1]):
        out[m.group(1)] = m.group(2).strip('"')
    return out


def parse_master(text: str, base: str) -> list[dict]:
    renditions = []
    lines = [line.strip() for line in text.splitlines()]
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF"):
            attrs = _attrs(line)
            uri = next((n for n in lines[i + 1 :] if n and not n.startswith("#")), "")
            width = height = None
            if "x" in attrs.get("RESOLUTION", ""):
                w, h = attrs["RESOLUTION"].split("x", 1)
                width, height = int(w), int(h)
            renditions.append(
                {
                    "bandwidth": int(attrs.get("BANDWIDTH", "0") or 0),
                    "width": width,
                    "height": height,
                    "codecs": attrs.get("CODECS", ""),
                    "uri": urljoin(base, uri),
                }
            )
    return renditions


def check_hls(res: FetchResult, text: str, fetcher: Fetcher, origins: list[str]) -> dict:
    url = res.final_url
    origin = _primary(origins)
    entry = _entry("hls", url)
    verdict = entry["playable_in_netfly"]
    entry["embed"] = {"type": "hls", "src": url}
    seen_origins = {origin_of(url)}
    blockers, warnings = [], []
    if res.status >= 400:
        verdict.update(verdict=NO, reasons=[f"The stream isn't reachable (HTTP {res.status})."])
        return entry
    cors = _cors_ok(res, origin)
    renditions = parse_master(text, url)
    media_text, media_url = text, url
    if renditions:
        entry["renditions"] = [{k: v for k, v in r.items() if k != "uri"} for r in renditions]
        best = max(renditions, key=lambda r: (r["height"] or 0, r["bandwidth"]))
        entry["width"], entry["height"] = best["width"], best["height"]
        cheapest = min(renditions, key=lambda r: r["bandwidth"] or 1 << 60)
        media_url = cheapest["uri"]
        seen_origins.add(origin_of(media_url))
        try:
            variant = fetcher.fetch(
                media_url, headers={"Origin": origin}, max_bytes=2 * 1024 * 1024
            )
            media_text = variant.text()
            if variant.status >= 400:
                blockers.append(f"A rendition playlist isn't reachable (HTTP {variant.status}).")
            cors = cors and _cors_ok(variant, origin)
            media_url = variant.final_url
        except FetchError as exc:
            blockers.append(f"A rendition playlist isn't reachable: {exc.message}")
            media_text = ""
    keys = [_attrs(line) for line in media_text.splitlines() if line.startswith("#EXT-X-KEY")]
    keys += [_attrs(line) for line in text.splitlines() if line.startswith("#EXT-X-SESSION-KEY")]
    drm = [
        k
        for k in keys
        if k.get("METHOD", "").upper().startswith("SAMPLE-AES")
        or any(f in k.get("KEYFORMAT", "").lower() for f in DRM_KEYFORMATS)
    ]
    if drm:
        blockers.append("Encrypted stream (DRM) — cannot be played without a licence.")
    elif any(k.get("METHOD", "").upper() == "AES-128" for k in keys):
        warnings.append(
            "Segments are AES-128 encrypted; they play only while the key URL stays reachable."
        )
    durations = [float(m.group(1)) for m in re.finditer(r"#EXTINF:([\d.]+)", media_text)]
    if durations and "#EXT-X-ENDLIST" in media_text:
        entry["duration"] = round(sum(durations), 2)
    elif media_text and "#EXT-X-ENDLIST" not in media_text:
        warnings.append("Live stream (no end).")
    segments = [
        line.strip()
        for line in media_text.splitlines()
        if line.strip() and not line.startswith("#")
    ]
    init = next(
        (
            _attrs(line).get("URI")
            for line in media_text.splitlines()
            if line.startswith("#EXT-X-MAP")
        ),
        None,
    )
    first_segment = urljoin(media_url, init or (segments[0] if segments else ""))
    segment_ok = None
    if segments and not drm:
        seen_origins.add(origin_of(first_segment))
        try:
            seg = fetcher.fetch(
                first_segment, headers={"Origin": origin, "Range": "bytes=0-1023"}, read_limit=1024
            )
            segment_ok = seg.status < 400
            if not segment_ok:
                blockers.append(f"Segments aren't reachable (HTTP {seg.status}).")
            cors = cors and _cors_ok(seg, origin)
        except FetchError as exc:
            segment_ok = False
            blockers.append(f"Segments aren't reachable: {exc.message}")
    if not cors:
        blockers.append(
            "The stream doesn't allow NETFLY's origin (CORS), so the player can't load it."
        )
    for candidate in (url, media_url, first_segment):
        if candidate and (expires := expiry_of(candidate)):
            blockers.append(f"Temporary link — will stop working ({expires}).")
            break
    if url.startswith("http://") and origin.startswith("https://"):
        blockers.append("Plain http stream: an https NETFLY page can't load it (mixed content).")
    entry["cors"] = cors
    entry["drm"] = bool(drm)
    entry["origins"] = sorted(o for o in seen_origins if o)
    label = "HLS"
    if renditions:
        label += f", {len(renditions)} renditions up to {entry['height'] or '?'}p"
    if entry.get("duration"):
        label += f", {clock(entry['duration'])}"
    if blockers:
        verdict.update(
            verdict=NO, reasons=[f"{label} — doesn't play in NETFLY.", *blockers, *warnings]
        )
    else:
        verdict.update(
            verdict=YES, reasons=[f"{label} — plays in NETFLY (CORS allowed).", *warnings]
        )
    return entry


def check_dash(res: FetchResult, text: str) -> dict:
    entry = _entry("dash", res.final_url)
    entry["embed"] = {"type": "dash", "src": res.final_url}
    entry["origins"] = [origin_of(res.final_url)]
    verdict = entry["playable_in_netfly"]
    try:
        root = ElementTree.fromstring(text.encode("utf-8"))
    except ElementTree.ParseError:
        verdict.update(verdict=NO, reasons=["The DASH manifest can't be read."])
        return entry

    def local(tag):
        return tag.rsplit("}", 1)[-1]

    reps = []
    drm = False
    for node in root.iter():
        name = local(node.tag)
        if name == "ContentProtection":
            drm = True
        elif name == "Representation":
            reps.append(
                {
                    "bandwidth": int(node.get("bandwidth") or 0),
                    "width": (
                        int(node.get("width")) if (node.get("width") or "").isdigit() else None
                    ),
                    "height": (
                        int(node.get("height")) if (node.get("height") or "").isdigit() else None
                    ),
                    "codecs": node.get("codecs") or "",
                }
            )
    entry["renditions"] = reps
    if heights := [r["height"] for r in reps if r["height"]]:
        entry["height"] = max(heights)
    entry["duration"] = parse_iso_duration(root.get("mediaPresentationDuration"))
    entry["drm"] = drm
    if drm:
        verdict.update(verdict=NO, reasons=["Encrypted stream (DRM) — cannot be played."])
    elif expires := expiry_of(res.final_url):
        verdict.update(verdict=NO, reasons=[f"Temporary link — will stop working ({expires})."])
    else:
        verdict.update(
            verdict=UNKNOWN,
            reasons=[
                "DASH stream: NETFLY's player plays HLS and MP4, so DASH needs a player update first."
            ],
        )
    return entry


# ---- signed, expiring URLs -----------------------------------------------------------------------


def expiry_of(url: str) -> str | None:
    """A human hint when the URL carries a signature with an expiry (it will stop working)."""
    try:
        query = {k.lower(): v[0] for k, v in parse_qs(urlsplit(url).query).items()}
    except ValueError:
        return None
    when: dt.datetime | None = None
    try:
        if "x-amz-expires" in query and "x-amz-date" in query:
            start = dt.datetime.strptime(query["x-amz-date"], "%Y%m%dT%H%M%SZ").replace(
                tzinfo=dt.UTC
            )
            when = start + dt.timedelta(seconds=int(query["x-amz-expires"]))
        elif "x-goog-expires" in query and "x-goog-date" in query:
            start = dt.datetime.strptime(query["x-goog-date"], "%Y%m%dT%H%M%SZ").replace(
                tzinfo=dt.UTC
            )
            when = start + dt.timedelta(seconds=int(query["x-goog-expires"]))
        elif "se" in query and "sig" in query:  # Azure SAS
            when = dt.datetime.fromisoformat(query["se"].replace("Z", "+00:00"))
        else:
            for key in ("expires", "expire", "exp", "e", "validto", "x-expires"):
                value = query.get(key, "")
                if value.isdigit() and len(value) >= 9:
                    when = dt.datetime.fromtimestamp(int(value[:10]), dt.UTC)
                    break
            for key in ("hdnts", "hdnea", "__token__"):
                if m := re.search(r"exp=(\d{9,10})", query.get(key, "")):
                    when = dt.datetime.fromtimestamp(int(m.group(1)), dt.UTC)
            if (
                when is None
                and "signature" in query
                and ("policy" in query or "key-pair-id" in query)
            ):
                return "signed link with an expiry policy"
    except (ValueError, OverflowError):
        return "signed link"
    if when is None:
        return None
    return f"expires {when.strftime('%Y-%m-%d %H:%M')} UTC"
