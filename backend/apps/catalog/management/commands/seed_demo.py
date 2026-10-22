"""Seed an original demo catalog: generated artwork + generated videos, real pipeline.

    python manage.py seed_demo [--admin-password PASS] [--no-media] [--duration 40]

Idempotent: does nothing if demo titles exist. Media (images, videos) is pushed
through the same ingest/transcode pipeline as admin uploads, so it needs S3
configured; with `--no-media` (or no storage) titles are created without media.
"""

import datetime as dt
import io
import random
import subprocess
import tempfile
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from apps.accounts.models import User
from apps.catalog.models import Billboard, Episode, Genre, HomeRow, Season, Title
from apps.catalog.services import link_related
from apps.core import storage
from apps.media import images
from apps.media.models import VideoAsset
from apps.media.tasks import queue_transcode

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

COMING_SOON = [
    ("Glass Orchard", "A botanist inherits an orchard where the fruit remembers who planted it."),
    (
        "Signal Fire",
        "Two rival radio hosts discover their broadcasts are reaching the same stranger.",
    ),
]

GENRES = ["Action", "Drama", "Comedy", "Thriller", "Sci-Fi", "Romance", "Mystery"]

MOVIES = [
    (
        "Neon Tide",
        ["Sci-Fi", "Thriller"],
        "translated",
        "DJ Kanda",
        "PG-13",
        2025,
        "A salvage diver finds a city of light beneath the harbour — and someone who wants it to stay hidden.",
        ((14, 165, 233), (124, 58, 237)),
        "life",
    ),
    (
        "The Last Lantern",
        ["Drama", "Mystery"],
        "not_translated",
        "",
        "PG",
        2024,
        "In a mountain village without electricity, the keeper of the last lantern must decide who gets the light.",
        ((245, 158, 11), (127, 29, 29)),
        "mandelbrot",
    ),
    (
        "Paper Kings",
        ["Comedy", "Drama"],
        "translated",
        "VJ Sanko",
        "PG-13",
        2023,
        "Two rival street vendors accidentally become the most powerful newspaper barons in town.",
        ((234, 179, 8), (22, 163, 74)),
        "cellauto",
    ),
    (
        "Iron Savanna",
        ["Action", "Thriller"],
        "not_translated",
        "",
        "R",
        2025,
        "A retired ranger has one night to get a stolen convoy across the plains before dawn.",
        ((220, 38, 38), (30, 27, 75)),
        "testsrc2",
    ),
    (
        "Quiet Harbour",
        ["Romance", "Drama"],
        "translated",
        "DJ Kanda",
        "PG",
        2022,
        "Every summer, a ferry captain and a lighthouse painter meet on the same crossing — for ten years.",
        ((236, 72, 153), (14, 116, 144)),
        "gradients",
    ),
    (
        "Static Bloom",
        ["Sci-Fi", "Mystery"],
        "not_translated",
        "",
        "PG-13",
        2024,
        "A radio astronomer hears a garden growing on the other side of the static.",
        ((34, 197, 94), (17, 24, 39)),
        "mandelbrot",
    ),
]

SERIES = [
    (
        "Kingdom of Ash",
        ["Drama", "Action"],
        "translated",
        "VJ Sanko",
        "TV-14",
        2025,
        "Heirs to a burning throne fight to rebuild a kingdom — and each other.",
        ((249, 115, 22), (68, 10, 10)),
        "life",
        [
            ["The Ember Crown", "Smoke Over Kessa", "A Debt of Fire"],
            ["Cinders", "The Glass Road", "Coronation"],
        ],
    ),
    (
        "Night Shift",
        ["Mystery", "Thriller"],
        "not_translated",
        "",
        "TV-MA",
        2024,
        "The overnight crew of a city hospital solves the cases nobody on the day shift can see.",
        ((99, 102, 241), (15, 23, 42)),
        "cellauto",
        [["Admission", "Code Silver", "Discharge"]],
    ),
    (
        "The Rain",
        ["Sci-Fi", "Drama"],
        "translated",
        "DJ Kanda",
        "TV-MA",
        2018,
        "After a storm that never ends, a ferry pilot and her brother cross a drowned coastline to "
        "find the one town where the rain has stopped.",
        ((56, 189, 248), (15, 23, 42)),
        "gradients",
        [["First Light", "High Water", "The Ferry"], ["Undertow", "Dry Land"]],
    ),
]

# Titles with their own credits (the rest share the demo cast).
CREDITS = {
    "The Rain": (["Mira Solberg", "Jonas Ekdahl", "Ama Mensah"], ["Kari Lund"]),
}

RELATED = [
    ("Neon Tide", "Static Bloom", 5),
    ("Neon Tide", "Iron Savanna", 3),
    ("The Last Lantern", "Quiet Harbour", 4),
    ("Paper Kings", "Quiet Harbour", 2),
    ("Kingdom of Ash", "Iron Savanna", 4),
    ("Night Shift", "Static Bloom", 3),
    ("Kingdom of Ash", "The Last Lantern", 3),
    ("Neon Tide", "Kingdom of Ash", 4),
    ("Neon Tide", "Paper Kings", 3),
    ("Neon Tide", "Quiet Harbour", 2),
    ("Iron Savanna", "Night Shift", 4),
    ("Iron Savanna", "The Last Lantern", 2),
]


def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for w in words:
        candidate = f"{line} {w}".strip()
        if draw.textlength(candidate, font=font) <= width:
            line = candidate
        else:
            lines.append(line)
            line = w
    return [*lines, line] if line else lines


def artwork(name: str, colors, size: tuple[int, int], *, with_text: bool, seed: int) -> bytes:
    """Cinematic abstract key art: gradient field, glowing orbs, grain, optional title."""
    w, h = size
    rng = random.Random(seed)
    (r1, g1, b1), (r2, g2, b2) = colors
    base = Image.new("RGB", (w, h))
    px = base.load()
    for y in range(h):
        for x in range(0, w, 2):
            t = x / w * 0.35 + y / h * 0.65
            c = (int(r1 * (1 - t) + r2 * t), int(g1 * (1 - t) + g2 * t), int(b1 * (1 - t) + b2 * t))
            px[x, y] = c
            if x + 1 < w:
                px[x + 1, y] = c
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for _ in range(7):
        rad = rng.randint(min(w, h) // 8, min(w, h) // 2)
        cx, cy = rng.randint(0, w), rng.randint(0, h)
        tint = tuple(min(255, int(c * 1.4) + 40) for c in rng.choice(colors))
        gd.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=tint)
    glow = glow.filter(ImageFilter.GaussianBlur(min(w, h) // 9))
    image = Image.blend(base, glow, 0.45)
    lines = ImageDraw.Draw(image)
    for i in range(14):
        y = int(h * (0.55 + 0.03 * i + rng.random() * 0.01))
        lines.line((0, y, w, y - int(h * 0.25)), fill=(255, 255, 255), width=1)
    # Vignette
    vignette = Image.new("L", (w, h), 0)
    vd = ImageDraw.Draw(vignette)
    vd.ellipse((-w * 0.25, -h * 0.25, w * 1.25, h * 1.25), fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(min(w, h) // 5))
    image = Image.composite(image, Image.new("RGB", (w, h), (6, 6, 10)), vignette)
    noise = Image.effect_noise((w, h), 22).convert("RGB")
    image = Image.blend(image, noise, 0.06)
    if with_text:
        draw = ImageDraw.Draw(image)
        font = _font(FONT_BOLD, int(w * 0.13))
        rows = _wrap(draw, name.upper(), font, int(w * 0.84))
        line_h = int(font.size * 1.05)
        y = int(h * 0.80) - line_h * len(rows)
        for row in rows:
            tw = draw.textlength(row, font=font)
            draw.text(((w - tw) / 2 + 3, y + 4), row, font=font, fill=(0, 0, 0))
            draw.text(((w - tw) / 2, y), row, font=font, fill=(250, 250, 250))
            y += line_h
        small = _font(FONT, int(w * 0.035))
        tag = "A NETFLY ORIGINAL"
        draw.text(
            ((w - draw.textlength(tag, font=small)) / 2, int(h * 0.86)),
            tag,
            font=small,
            fill=(230, 230, 230),
        )
    out = io.BytesIO()
    image.save(out, "JPEG", quality=92)
    return out.getvalue()


def logo_art(name: str, colors) -> bytes:
    font = _font(FONT_BOLD, 150)
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    tw = int(probe.textlength(name.upper(), font=font))
    image = Image.new("RGBA", (tw + 80, 240), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.text((44, 46), name.upper(), font=font, fill=(0, 0, 0, 140))
    draw.text((40, 40), name.upper(), font=font, fill=(255, 255, 255, 255))
    accent = tuple(colors[0]) + (255,)
    draw.rectangle((40, 214, 40 + tw // 3, 222), fill=accent)
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def make_video(
    path: Path,
    name: str,
    source: str,
    duration: int,
    colors,
    *,
    intro: tuple[int, int] | None = None,
    credits: int | None = None,
) -> None:
    (r, g, b), _ = colors
    sources = {
        "life": f"life=size=480x270:rate=24:ratio=0.12:death_color=#{r:02x}{g:02x}{b:02x}:life_color=#ffffff:mold=10,scale=1920:1080:flags=neighbor",
        "mandelbrot": "mandelbrot=size=960x540:rate=24,scale=1920:1080",
        "cellauto": "cellauto=size=480x270:rate=24:rule=110,scale=1920:1080:flags=neighbor,negate",
        "testsrc2": "testsrc2=size=1920x1080:rate=24",
        "gradients": "gradients=size=1920x1080:rate=24:speed=0.02",
    }
    vf = sources.get(source, sources["testsrc2"])
    label = name.replace("'", "").replace(":", " ")
    overlays = [
        f"drawtext=fontfile={FONT_BOLD}:text='{label}':fontcolor=white:fontsize=88:x=(w-text_w)/2:y=h*0.42:shadowx=3:shadowy=3",
        f"drawtext=fontfile={FONT}:text='%{{pts\\:hms}}':fontcolor=white@0.85:fontsize=40:x=(w-text_w)/2:y=h*0.58",
    ]
    if intro:
        overlays.append(
            f"drawtext=fontfile={FONT_BOLD}:text='INTRO':fontcolor=yellow:fontsize=60:x=80:y=80:enable='between(t,{intro[0]},{intro[1]})'"
        )
    if credits:
        overlays.append(
            f"drawtext=fontfile={FONT_BOLD}:text='CREDITS':fontcolor=white:fontsize=60:x=80:y=80:enable='gte(t,{credits})'"
        )
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"{vf},format=yuv420p," + ",".join(overlays),
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={220 + (r % 200)}:sample_rate=48000,volume=0.08",
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-metadata:s:a:0",
            "language=eng",
            "-movflags",
            "+faststart",
            str(path),
        ],
        check=True,
    )


class Command(BaseCommand):
    help = "Seed an original demo catalog (generated art + video) through the real pipeline."

    def add_arguments(self, parser):
        parser.add_argument(
            "--admin-password",
            default="",
            help="Create superadmin 'admin' with this password if no staff exists.",
        )
        parser.add_argument("--no-media", action="store_true")
        parser.add_argument("--duration", type=int, default=40, help="Seconds per generated video.")
        parser.add_argument("--reset", action="store_true", help="Delete the demo titles first.")

    def handle(self, *args, **opts):
        if opts["admin_password"] and not User.objects.filter(is_staff=True).exists():
            User.objects.create_superuser("admin", opts["admin_password"], full_name="Studio Admin")
            self.stdout.write(self.style.SUCCESS("Created superadmin 'admin'."))
        if opts["reset"]:
            from django.utils.text import slugify

            slugs = [slugify(m[0]) for m in MOVIES] + [slugify(m[0]) for m in SERIES]
            deleted, _ = Title.objects.filter(slug__in=slugs).delete()
            self.stdout.write(f"Removed {deleted} demo rows.")
        if Title.objects.filter(slug="neon-tide").exists():
            self._coming_soon()
            added = self._add_missing()
            self.stdout.write(
                "Demo catalog already present — Coming Soon titles ensured"
                + (f", added {', '.join(added)}." if added else ".")
            )
            return
        media = not opts["no_media"] and storage.is_configured()
        if not media:
            self.stdout.write(
                self.style.WARNING(
                    "Storage not configured (or --no-media): creating titles without media."
                )
            )
        self.duration = max(12, opts["duration"])
        self.work = Path(tempfile.mkdtemp(prefix="netfly-seed-"))

        genres = {}
        for i, name in enumerate(GENRES):
            genres[name], _ = Genre.objects.get_or_create(
                slug=name.lower().replace(" ", "-"),
                defaults={"name": name, "order": i, "show_on_home": i < 4},
            )
        titles: dict[str, Title] = {}
        for n, (name, gs, tr, translator, rating, year, synopsis, colors, source) in enumerate(
            MOVIES
        ):
            titles[name] = self._title(
                name, "movie", gs, tr, translator, rating, year, synopsis, colors, genres, n, media
            )
            if media:
                titles[name].video = self._video(name, source, colors, "feature")
                if n in (0, 3):
                    titles[name].trailer = self._video(
                        f"{name} — Trailer", source, colors, "trailer", duration=16
                    )
                titles[name].save()
        for n, (
            name,
            gs,
            tr,
            translator,
            rating,
            year,
            synopsis,
            colors,
            source,
            seasons,
        ) in enumerate(SERIES, start=len(MOVIES)):
            title = titles[name] = self._title(
                name, "series", gs, tr, translator, rating, year, synopsis, colors, genres, n, media
            )
            for s_no, episodes in enumerate(seasons, start=1):
                season = Season.objects.create(title=title, number=s_no, name=f"Season {s_no}")
                for e_no, ep_name in enumerate(episodes, start=1):
                    intro = (3, 11)
                    credits = self.duration - 8
                    ep = Episode.objects.create(
                        season=season,
                        number=e_no,
                        name=ep_name,
                        runtime_minutes=max(1, self.duration // 60),
                        synopsis=f"{name}, season {s_no}: {ep_name.lower()}.",
                        intro_start=intro[0],
                        intro_end=intro[1],
                        credits_start=credits,
                    )
                    if media:
                        ep.thumbnail = self._image(
                            f"{name} {ep_name}",
                            colors,
                            "thumbnail",
                            (1280, 720),
                            seed=n * 100 + s_no * 10 + e_no,
                            text=False,
                        )
                        ep.video = self._video(
                            f"{name} S{s_no}E{e_no}",
                            source,
                            colors,
                            "episode",
                            intro=intro,
                            credits=credits,
                        )
                        ep.save()
        for a, b, w in RELATED:
            link_related(titles[a], titles[b], w, True)
        with transaction.atomic():
            now = timezone.now()
            for i, title in enumerate(titles.values()):
                title.refresh_from_db()
                if not media:
                    title.status = Title.Status.PUBLISHED
                title.published_at = now - dt.timedelta(days=i * 9)
                title.popularity = 10 - i
                title.trending = 10 - ((i * 3) % 8)
                title.save(
                    update_fields=["status", "published_at", "popularity", "trending", "updated_at"]
                )
            for order, name in enumerate(
                ["Neon Tide", "Kingdom of Ash", "Iron Savanna", "Night Shift"]
            ):
                Billboard.objects.create(title=titles[name], order=order)
            if not HomeRow.objects.exists():
                for order, kind in enumerate(
                    [
                        "continue_watching",
                        "because_you_liked",
                        "top_picks",
                        "trending",
                        "top10",
                        "new_releases",
                        "home_genres",
                        "my_list",
                    ]
                ):
                    HomeRow.objects.create(kind=kind, order=order)
        self._coming_soon()
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(titles)} titles."
                + (
                    " Videos are transcoding; titles publish automatically when ready."
                    if media
                    else ""
                )
            )
        )

    def _add_missing(self) -> list[str]:
        """Demo titles added to this file after a database was seeded (no media, published)."""
        from django.utils.text import slugify

        self.duration = 60
        genres = {
            name: Genre.objects.get_or_create(
                slug=name.lower().replace(" ", "-"), defaults={"name": name, "order": i}
            )[0]
            for i, name in enumerate(GENRES)
        }
        added = []
        entries = [(m, "movie", None) for m in MOVIES] + [(m[:9], "series", m[9]) for m in SERIES]
        for n, (
            (name, gs, tr, translator, rating, year, synopsis, colors, _),
            kind,
            seasons,
        ) in enumerate(entries):
            if Title.objects.filter(slug=slugify(name)).exists():
                continue
            title = self._title(
                name, kind, gs, tr, translator, rating, year, synopsis, colors, genres, n, False
            )
            for s_no, episodes in enumerate(seasons or [], start=1):
                season = Season.objects.create(title=title, number=s_no, name=f"Season {s_no}")
                for e_no, ep_name in enumerate(episodes, start=1):
                    Episode.objects.create(
                        season=season,
                        number=e_no,
                        name=ep_name,
                        runtime_minutes=1,
                        synopsis=f"{name}, season {s_no}: {ep_name.lower()}.",
                    )
            title.status = Title.Status.PUBLISHED
            title.published_at = timezone.now()
            title.save(update_fields=["status", "published_at", "updated_at"])
            added.append(name)
        return added

    def _coming_soon(self) -> None:
        """Two scheduled drafts for New & Popular → Coming Soon (kept a few days ahead)."""
        drama = Genre.objects.filter(slug="drama").first()
        for days, (name, synopsis) in zip((5, 12), COMING_SOON, strict=True):
            from django.utils.text import slugify

            title, _ = Title.objects.update_or_create(
                slug=slugify(name),
                defaults={
                    "type": Title.Type.MOVIE,
                    "title": name,
                    "synopsis": synopsis,
                    "short_synopsis": synopsis,
                    "year": timezone.now().year,
                    "maturity_rating": "PG-13",
                    "runtime_minutes": 1,
                    "language": "en",
                    "translation_status": "translated",
                    "rights_holder": "NETFLY Studios (demo)",
                    "status": Title.Status.DRAFT,
                    "publish_at": timezone.now() + dt.timedelta(days=days),
                },
            )
            if drama:
                title.genres.add(drama)

    def _title(
        self, name, kind, gs, tr, translator, rating, year, synopsis, colors, genres, n, media
    ) -> Title:
        from django.utils.text import slugify

        title = Title.objects.create(
            type=kind,
            slug=slugify(name),
            title=name,
            synopsis=synopsis,
            short_synopsis=synopsis,
            year=year,
            maturity_rating=rating,
            runtime_minutes=max(1, self.duration // 60) if kind == "movie" else None,
            language="en",
            translation_status=tr,
            translator_name=translator,
            rights_holder="NETFLY Studios (demo)",
            cast=(
                CREDITS[name][0]
                if name in CREDITS
                else ["Amani Okoro", "Lena Varga", "Tomasz Reyes", "Nia Castell"][n % 2 : n % 2 + 3]
            ),
            directors=(
                CREDITS[name][1]
                if name in CREDITS
                else ["Ines Mbeki" if n % 2 else "Joon Halvorsen"]
            ),
            is_featured=n in (0, 6),
            # Media titles wait in 'processing' and go live when their first video is ready.
            status=Title.Status.PROCESSING if media else Title.Status.DRAFT,
        )
        title.genres.set([genres[g] for g in gs])
        if media:
            title.poster = self._image(name, colors, "poster", (1000, 1500), seed=n, text=True)
            title.backdrop = self._image(
                name, colors, "backdrop", (2560, 1440), seed=n + 50, text=False
            )
            title.logo = images.ingest(
                SimpleUploadedFile(f"{name}-logo.png", logo_art(name, colors), "image/png"), "logo"
            )
            title.save()
        return title

    def _image(self, name, colors, kind, size, *, seed, text):
        data = artwork(name, colors, size, with_text=text, seed=seed)
        return images.ingest(SimpleUploadedFile(f"{kind}.jpg", data, "image/jpeg"), kind)

    def _video(
        self, name, source, colors, kind, *, duration=None, intro=None, credits=None
    ) -> VideoAsset:
        duration = duration or self.duration
        path = self.work / f"{abs(hash(name))}.mp4"
        make_video(path, name, source, duration, colors, intro=intro, credits=credits)
        asset = VideoAsset.objects.create(
            kind=kind,
            status=VideoAsset.Status.UPLOADED,
            original_filename=f"{name}.mp4",
            source_size=path.stat().st_size,
            source_content_type="video/mp4",
        )
        asset.source_key = storage.upload_file(
            str(path), f"sources/{asset.pk}/source.mp4", "video/mp4"
        )
        asset.save(update_fields=["source_key"])
        queue_transcode(asset)
        path.unlink(missing_ok=True)
        self.stdout.write(f"  queued {kind}: {name}")
        return asset
