"""What a link is: by extension, by Content-Type, by sniffing the first bytes, by provider."""

import re
from urllib.parse import urlsplit

import filetype

from .models import DiscoveredLink

K = DiscoveredLink.Kind

VIDEO_EXT = {".mp4", ".webm", ".mov", ".m4v", ".mkv", ".ogv", ".avi"}
STREAM_EXT = {".m3u8", ".mpd"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp"}
DOCUMENT_EXT = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"}
DOCUMENT_EXT |= {".rtf", ".odt", ".ods", ".epub"}
PAGE_EXT = {"", ".html", ".htm", ".xhtml", ".php", ".asp", ".aspx", ".jsp", ".cfm", ".shtml"}
OTHER_EXT = {".js", ".mjs", ".css", ".json", ".xml", ".zip", ".gz", ".mp3", ".m4a", ".aac"}
OTHER_EXT |= {".wav", ".flac", ".ogg", ".woff", ".woff2", ".ttf", ".vtt", ".srt", ".rss"}

STREAM_TYPES = {
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "audio/mpegurl",
    "audio/x-mpegurl",
    "application/dash+xml",
}
PAGE_TYPES = {"text/html", "application/xhtml+xml"}
DOCUMENT_TYPES = {
    "application/pdf",
    "application/msword",
    "text/plain",
    "text/csv",
    "application/rtf",
    "application/epub+zip",
}

# Video pages and players of providers we know (checked through oEmbed or their embed URL).
PROVIDER_PATTERNS: list[tuple[str, re.Pattern]] = [
    (
        "YouTube",
        re.compile(
            r"^https?://(?:(?:www|m|music)\.)?(?:youtube\.com/(?:watch\?|shorts/|embed/|live/|v/|playlist\?)"
            r"|youtube-nocookie\.com/embed/|youtu\.be/)",
            re.I,
        ),
    ),
    (
        "Vimeo",
        re.compile(
            # A video (numeric id), not a channel, group or showcase page.
            r"^https?://(?:www\.|player\.)?vimeo\.com/(?:video/|channels/[\w-]+/|groups/[\w-]+/videos/"
            r"|showcase/\d+/video/)?\d+(?:[/?#]|$)",
            re.I,
        ),
    ),
    (
        "Dailymotion",
        re.compile(
            r"^https?://(?:www\.|geo\.)?dailymotion\.com/(?:video/|embed/|player)|^https?://dai\.ly/",
            re.I,
        ),
    ),
    (
        "Wistia",
        re.compile(
            r"^https?://(?:[\w-]+\.)?(?:wistia\.com|wistia\.net|wi\.st)/(?:medias|embed)/", re.I
        ),
    ),
    (
        "JW Player",
        re.compile(
            r"^https?://(?:cdn\.jwplayer\.com|content\.jwplatform\.com)/(?:players|previews|v2/media)/",
            re.I,
        ),
    ),
    (
        "Facebook",
        re.compile(
            r"^https?://(?:www\.|m\.)?facebook\.com/(?:[^/]+/videos/|watch/?\?v=|video\.php\?|reel/|plugins/video\.php)|^https?://fb\.watch/",
            re.I,
        ),
    ),
    ("Instagram", re.compile(r"^https?://(?:www\.)?instagram\.com/(?:p|reel|tv)/", re.I)),
    (
        "TikTok",
        re.compile(
            r"^https?://(?:www\.|m\.)?tiktok\.com/(?:@[^/]+/video/|embed/)|^https?://vm\.tiktok\.com/",
            re.I,
        ),
    ),
    ("Twitch", re.compile(r"^https?://(?:www\.|m\.|clips\.|player\.)?twitch\.tv/", re.I)),
    ("Streamable", re.compile(r"^https?://(?:www\.)?streamable\.com/(?:e/)?\w+", re.I)),
    ("SoundCloud", re.compile(r"^https?://(?:www\.|m\.|w\.)?soundcloud\.com/", re.I)),
]


# Frames that are never videos: sign-in, consent, captcha, tag managers, ads, payment widgets.
NOT_PLAYER_HOSTS = re.compile(
    r"^https?://(?:[\w-]+\.)*(?:accounts\.google\.com|googletagmanager\.com|doubleclick\.net|"
    r"googlesyndication\.com|recaptcha\.net|hcaptcha\.com|challenges\.cloudflare\.com|"
    r"consent\.(?:google|youtube)\.com|js\.stripe\.com|platform\.twitter\.com|"
    r"facebook\.com/plugins/(?:like|page|comments))|^https?://www\.google\.com/recaptcha",
    re.I,
)


def is_player_frame(url: str) -> bool:
    return not NOT_PLAYER_HOSTS.match(url)


def provider_for(url: str) -> str | None:
    for name, pattern in PROVIDER_PATTERNS:
        if pattern.match(url):
            return name
    return None


def extension(url: str) -> str:
    path = urlsplit(url).path.lower()
    last = path.rsplit("/", 1)[-1]
    return "." + last.rsplit(".", 1)[-1] if "." in last else ""


def by_extension(url: str) -> str | None:
    if provider_for(url):
        return K.EMBED
    ext = extension(url)
    if ext in VIDEO_EXT:
        return K.VIDEO_FILE
    if ext in STREAM_EXT:
        return K.STREAM
    if ext in IMAGE_EXT:
        return K.IMAGE
    if ext in DOCUMENT_EXT:
        return K.DOCUMENT
    if ext in OTHER_EXT:
        return K.OTHER
    if ext in PAGE_EXT:
        return K.PAGE
    return None  # unknown: Content-Type or sniffing decides


def by_content_type(content_type: str) -> str | None:
    ct = (content_type or "").split(";", 1)[0].strip().lower()
    if not ct or ct in ("application/octet-stream", "binary/octet-stream"):
        return None
    if ct in PAGE_TYPES:
        return K.PAGE
    if ct in STREAM_TYPES:
        return K.STREAM
    if ct.startswith("video/"):
        return K.VIDEO_FILE
    if ct.startswith("image/"):
        return K.IMAGE
    if ct in DOCUMENT_TYPES or ct.startswith("application/vnd.openxmlformats"):
        return K.DOCUMENT
    return K.OTHER


def sniff(head: bytes) -> str | None:
    """Kind from the first bytes, for missing or generic Content-Types."""
    if not head:
        return None
    text = head[:512].lstrip().lower()
    if text.startswith(b"#extm3u"):
        return K.STREAM
    if b"<mpd" in text:
        return K.STREAM
    if text.startswith((b"<!doctype html", b"<html")) or b"<head" in text:
        return K.PAGE
    kind = filetype.guess(head)
    if kind is None:
        return None
    if kind.mime.startswith("video/"):
        return K.VIDEO_FILE
    if kind.mime.startswith("image/"):
        return K.IMAGE
    if kind.mime == "application/pdf":
        return K.DOCUMENT
    return K.OTHER


def is_video_kind(kind: str) -> bool:
    return kind in DiscoveredLink.VIDEO_KINDS
