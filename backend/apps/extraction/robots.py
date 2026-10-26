"""robots.txt (Disallow + Crawl-delay for NetflyBot or *) and sitemaps (indexes, gzip, video)."""

import gzip
import io
import zlib
from dataclasses import dataclass, field
from urllib.robotparser import RobotFileParser

from defusedxml import ElementTree

from .models import DiscoveredLink
from .urls_norm import normalize

BOT = "NetflyBot"
K = DiscoveredLink.Kind
MAX_SITEMAPS = 10
MAX_SITEMAP_BYTES = 20 * 1024 * 1024


class Robots:
    def __init__(self, text: str | None):
        self.parser = RobotFileParser()
        self.parser.parse((text or "").splitlines())
        self.present = text is not None

    def allowed(self, url: str) -> bool:
        return self.parser.can_fetch(BOT, url)

    def crawl_delay(self) -> float | None:
        delay = self.parser.crawl_delay(BOT)
        return float(delay) if delay is not None else None

    def sitemaps(self) -> list[str]:
        return list(self.parser.site_maps() or [])


ALLOW_ALL = Robots("")


@dataclass
class SitemapEntry:
    url: str
    kind: str
    meta: dict = field(default_factory=dict)


@dataclass
class Sitemap:
    entries: list[SitemapEntry] = field(default_factory=list)
    children: list[str] = field(default_factory=list)  # nested sitemaps (from an index)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def gunzip_capped(data: bytes, cap: int = MAX_SITEMAP_BYTES) -> bytes:
    if not data.startswith(b"\x1f\x8b"):
        return data
    decoder = zlib.decompressobj(zlib.MAX_WBITS | 16)
    out = decoder.decompress(data, cap + 1)
    if len(out) > cap or decoder.unconsumed_tail:
        raise ValueError("sitemap too large")
    return out


def parse_sitemap(data: bytes, base: str) -> Sitemap:
    result = Sitemap()
    try:
        data = gunzip_capped(data)
        root = ElementTree.parse(io.BytesIO(data)).getroot()
    except (ElementTree.ParseError, ValueError, OSError, gzip.BadGzipFile):
        return result
    kind = _local(root.tag)
    if kind == "sitemapindex":
        for loc in root.iter():
            if _local(loc.tag) == "loc" and (url := normalize((loc.text or "").strip(), base)):
                result.children.append(url)
        return result
    for node in root:
        if _local(node.tag) != "url":
            continue
        for child in node:
            name = _local(child.tag)
            if name == "loc" and (url := normalize((child.text or "").strip(), base)):
                result.entries.append(SitemapEntry(url, K.PAGE))
            elif name == "video":
                meta = {}
                for item in child:
                    meta[_local(item.tag)] = (item.text or "").strip()
                facts = {
                    k: v
                    for k, v in {
                        "title": meta.get("title"),
                        "description": meta.get("description"),
                        "thumbnail": normalize(meta.get("thumbnail_loc", ""), base),
                        "duration": (
                            float(meta["duration"]) if meta.get("duration", "").isdigit() else None
                        ),
                    }.items()
                    if v
                }
                if url := normalize(meta.get("content_loc", ""), base):
                    result.entries.append(SitemapEntry(url, K.VIDEO_FILE, facts))
                if url := normalize(meta.get("player_loc", ""), base):
                    result.entries.append(SitemapEntry(url, K.EMBED, facts))
                if facts.get("thumbnail"):
                    result.entries.append(SitemapEntry(facts["thumbnail"], K.IMAGE))
    return result
