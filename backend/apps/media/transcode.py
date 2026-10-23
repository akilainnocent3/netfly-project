"""FFmpeg HLS transcoding: probe → adaptive ladder (fMP4) → sprites → upload."""

from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from apps.core import storage
from apps.core.config import config

logger = logging.getLogger(__name__)

CONTENT_TYPES = {
    ".m3u8": ("application/vnd.apple.mpegurl", storage.SHORT_CACHE),
    ".m4s": ("video/iso.segment", storage.LONG_CACHE),
    ".mp4": ("video/mp4", storage.LONG_CACHE),
    ".jpg": ("image/jpeg", storage.LONG_CACHE),
    ".vtt": ("text/vtt", storage.LONG_CACHE),
}
ENCODERS = {"h264": "libx264", "hevc": "libx265", "av1": "libsvtav1"}


class TranscodeError(RuntimeError):
    def __init__(self, message: str, log: str = "", permanent: bool = False):
        super().__init__(message)
        self.log = log
        self.permanent = permanent


class MissingToolchain(TranscodeError):
    """FFmpeg/ffprobe can't be run on this worker. Permanent until an operator fixes the host."""

    def __init__(self, name: str, log: str = ""):
        setting = f"Settings → Transcoding → {name} path"
        super().__init__(
            f"FFmpeg isn't installed on the transcoding worker ({name} not found). "
            f"Install FFmpeg on the worker, or set {setting}, then press Retry.",
            log,
            permanent=True,
        )
        self.tool = name


def tool(name: str) -> str:
    """Executable for `ffmpeg` / `ffprobe`: the configured path, else whatever PATH resolves."""
    configured = config.get_str(f"transcoding.{name}_path").strip()
    if configured:
        return configured
    return shutil.which(name) or name


_toolchain_cache: dict[tuple[str, str], dict] = {}


def toolchain() -> dict:
    """Resolve and run `-version` for both tools.

    A working toolchain is cached per process (keyed by the resolved paths). A broken one is
    re-checked every time — it fails instantly — so installing FFmpeg needs no worker restart.
    """
    paths = (tool("ffmpeg"), tool("ffprobe"))
    cached = _toolchain_cache.get(paths)
    if cached is not None:
        return cached
    result: dict = {"ok": True, "ffmpeg_version": "", "ffprobe_version": "", "message": ""}
    for name, path in zip(("ffmpeg", "ffprobe"), paths, strict=True):
        try:
            first = run([path, "-version"], timeout=15).splitlines()[0]
            # "ffmpeg version 6.1.1-3ubuntu5 Copyright …" → "6.1.1-3ubuntu5"
            result[f"{name}_version"] = first.split(" version ", 1)[-1].split(" ", 1)[0]
        except (TranscodeError, subprocess.TimeoutExpired, IndexError) as exc:
            missing = MissingToolchain(name, getattr(exc, "log", "") or str(exc))
            result.update(ok=False, message=str(missing), missing=name, log=missing.log)
            return result
    _toolchain_cache.clear()
    _toolchain_cache[paths] = result
    return result


def require_toolchain() -> None:
    status = toolchain()
    if not status["ok"]:
        raise MissingToolchain(status["missing"], status.get("log", ""))


@dataclass
class Probe:
    duration: float
    width: int
    height: int
    fps: float
    codec: str
    audio: list[dict]

    @property
    def display_height(self) -> int:
        return self.height


@dataclass
class Rung:
    name: str
    height: int
    width: int
    video_kbps: int
    max_kbps: int
    codec: str


def _missing(cmd: list[str], exc: OSError) -> MissingToolchain:
    name = "ffprobe" if cmd[0] == tool("ffprobe") or Path(cmd[0]).name == "ffprobe" else "ffmpeg"
    return MissingToolchain(name, f"{cmd[0]}: {exc}")


def run(cmd: list[str], timeout: int | None = None) -> str:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (FileNotFoundError, PermissionError) as exc:
        raise _missing(cmd, exc) from exc
    if result.returncode != 0:
        raise TranscodeError(
            f"{Path(cmd[0]).name} exited with {result.returncode}", result.stderr[-6000:]
        )
    return result.stdout


def probe(path: str, *, remote: bool = False) -> Probe:
    """`remote`: `path` is a signed URL, so a read failure may be the network, not the file."""
    try:
        out = run(
            [
                tool("ffprobe"),
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                path,
            ],
            timeout=120,
        )
    except MissingToolchain:
        raise  # the server is broken, not the file
    except TranscodeError as exc:
        if remote:
            raise TranscodeError("Couldn't read the source video from storage.", exc.log) from exc
        raise TranscodeError("This file isn't a readable video.", exc.log, permanent=True) from exc
    data = json.loads(out)
    video = next(
        (
            s
            for s in data.get("streams", [])
            if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")
        ),
        None,
    )
    if video is None:
        raise TranscodeError("The file has no video stream.", permanent=True)
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    rotation = 0
    for side in video.get("side_data_list", []) or []:
        if "rotation" in side:
            rotation = abs(int(side["rotation"]))
    rotation = rotation or abs(int((video.get("tags") or {}).get("rotate", 0) or 0))
    if rotation in (90, 270):
        width, height = height, width
    num, _, den = (video.get("avg_frame_rate") or video.get("r_frame_rate") or "24/1").partition(
        "/"
    )
    fps = float(num) / float(den or 1) if float(den or 1) else 24.0
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    audio = [
        {
            "index": s["index"],
            "language": (s.get("tags") or {}).get("language", "und"),
            "title": (s.get("tags") or {}).get("title", ""),
            "channels": int(s.get("channels") or 2),
            "default": bool((s.get("disposition") or {}).get("default")),
        }
        for s in data.get("streams", [])
        if s.get("codec_type") == "audio"
    ]
    if not width or not height or duration <= 0:
        raise TranscodeError("Couldn't read the video's size or duration.", permanent=True)
    return Probe(
        duration, width, height, fps if 1 < fps < 121 else 24.0, video.get("codec_name", ""), audio
    )


def build_ladder(source: Probe, ladder: list[dict]) -> list[Rung]:
    """Rungs at or below the source height (never upscale), keeping aspect ratio."""
    enabled = {"h264"}
    if config.get_bool("transcoding.hevc_enabled"):
        enabled.add("hevc")
    if config.get_bool("transcoding.av1_enabled"):
        enabled.add("av1")
    rungs: list[Rung] = []
    for item in sorted(ladder, key=lambda r: (-int(r["height"]), -int(r["video_kbps"]))):
        height = int(item["height"])
        codec = item.get("codec", "h264")
        if codec not in enabled or height > source.height:
            continue
        width = int(round(source.width * height / source.height / 2) * 2)
        rungs.append(
            Rung(
                item["name"],
                height,
                width,
                int(item["video_kbps"]),
                int(item.get("max_kbps") or item["video_kbps"] * 1.2),
                codec,
            )
        )
    if not rungs:
        # Source smaller than the smallest rung: one rung at source size.
        smallest = min(ladder, key=lambda r: int(r["height"]))
        h = source.height - source.height % 2
        w = source.width - source.width % 2
        scale = h / int(smallest["height"])
        kbps = max(200, int(int(smallest["video_kbps"]) * scale))
        rungs.append(Rung(f"{h}p", h, w, kbps, int(kbps * 1.2), "h264"))
    return rungs


def ffmpeg_command(src: str, out: Path, source: Probe, rungs: list[Rung]) -> list[str]:
    seg = config.get_int("transcoding.segment_seconds", 4)
    crf = config.get_int("transcoding.crf", 21)
    preset = config.get_str("transcoding.preset", "faster")
    audio_kbps = config.get_int("transcoding.audio_bitrate_kbps", 160)
    threads = config.get_int("transcoding.threads", 0)
    fps = source.fps
    gop = max(1, round(fps * seg))
    n = len(rungs)

    split = f"[0:v]split={n}" + "".join(f"[s{i}]" for i in range(n))
    scales = ";".join(
        f"[s{i}]scale={r.width}:{r.height}:flags=lanczos,setsar=1,format=yuv420p[v{i}]"
        for i, r in enumerate(rungs)
    )
    cmd = [
        tool("ffmpeg"),
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        src,
        "-filter_complex",
        f"{split};{scales}",
    ]
    if threads:
        cmd += ["-threads", str(threads)]
    for i, r in enumerate(rungs):
        enc = ENCODERS[r.codec]
        cmd += ["-map", f"[v{i}]", f"-c:v:{i}", enc]
        # Capped CRF: constant quality with a bitrate ceiling sized for the rung.
        if r.codec == "h264":
            cmd += [f"-crf:v:{i}", str(crf), f"-preset:v:{i}", preset, f"-profile:v:{i}", "high"]
        elif r.codec == "hevc":
            cmd += [f"-crf:v:{i}", str(crf + 3), f"-preset:v:{i}", preset, f"-tag:v:{i}", "hvc1"]
        else:
            cmd += [f"-crf:v:{i}", str(crf + 10), f"-preset:v:{i}", "8"]
        cmd += [f"-maxrate:v:{i}", f"{r.max_kbps}k", f"-bufsize:v:{i}", f"{r.max_kbps * 2}k"]
    cmd += [
        "-g",
        str(gop),
        "-keyint_min",
        str(gop),
        "-sc_threshold",
        "0",
        "-force_key_frames",
        f"expr:gte(t,n_forced*{seg})",
    ]
    audio_streams = source.audio or []
    for j, a in enumerate(audio_streams):
        cmd += [
            "-map",
            f"0:{a['index']}",
            f"-c:a:{j}",
            "aac",
            f"-b:a:{j}",
            f"{audio_kbps}k",
            f"-ac:a:{j}",
            "2",
        ]
    var_map = (
        [f"v:{i},agroup:aud,name:v{i}" for i in range(n)]
        if audio_streams
        else [f"v:{i},name:v{i}" for i in range(n)]
    )
    for j, a in enumerate(audio_streams):
        lang = re.sub(r"[^a-z]", "", a["language"].lower())[:3] or "und"
        var_map.append(
            f"a:{j},agroup:aud,language:{lang},name:a{j}{',default:yes' if j == 0 else ''}"
        )
    cmd += [
        "-f",
        "hls",
        "-hls_time",
        str(seg),
        "-hls_playlist_type",
        "vod",
        "-hls_segment_type",
        "fmp4",
        "-hls_flags",
        "independent_segments",
        "-hls_fmp4_init_filename",
        "init.mp4",
        "-hls_segment_filename",
        str(out / "%v" / "seg_%05d.m4s"),
        "-master_pl_name",
        "master.m3u8",
        "-var_stream_map",
        " ".join(var_map),
        "-progress",
        "pipe:1",
        "-stats_period",
        "1",
        str(out / "%v" / "index.m3u8"),
    ]
    return cmd


def encode(cmd: list[str], duration: float, on_progress: Callable[[float], None]) -> str:
    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except (FileNotFoundError, PermissionError) as exc:
        raise _missing(cmd, exc) from exc
    stderr_lines: list[str] = []

    def drain():
        assert process.stderr
        for line in process.stderr:
            stderr_lines.append(line)
            if len(stderr_lines) > 400:
                del stderr_lines[:200]

    import threading

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    last = 0.0
    assert process.stdout
    for line in process.stdout:
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                seconds = int(line.split("=", 1)[1]) / 1_000_000
            except ValueError:
                continue
            if time.monotonic() - last > 1.5:
                on_progress(min(1.0, seconds / duration) if duration else 0)
                last = time.monotonic()
    process.wait()
    reader.join(timeout=5)
    log = "".join(stderr_lines)[-6000:]
    if process.returncode != 0:
        raise TranscodeError(f"FFmpeg failed (exit {process.returncode})", log)
    return log


def timecode(seconds: float) -> str:
    """7:00, or 1:07:00 past an hour (what Studio shows and accepts)."""
    s = max(0, int(round(seconds)))
    h, m, sec = s // 3600, s % 3600 // 60, s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def clip_command(
    url: str,
    out: Path,
    source: Probe,
    start: float,
    length: float,
    *,
    fade: float = 0.0,
    audio: bool = True,
) -> list[str]:
    """Cut [start, start+length) out of a (remote) source into a high-quality mezzanine MP4.

    `-ss` before `-i` makes FFmpeg seek with HTTP range requests instead of reading from the
    start; re-encoding (not stream copy) makes the cut frame-accurate instead of snapping to the
    nearest keyframe. Resolution, frame rate and aspect ratio are the source's.
    """
    preset = config.get_str("transcoding.preset", "faster")
    audio_kbps = config.get_int("transcoding.audio_bitrate_kbps", 160)
    threads = config.get_int("transcoding.threads", 0)
    track = next((a for a in source.audio if a.get("default")), None) or (
        source.audio[0] if source.audio else None
    )
    cmd = [
        tool("ffmpeg"),
        "-hide_banner",
        "-nostdin",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        url,
        "-t",
        f"{length:.3f}",
        "-map",
        "0:v:0",
        "-c:v",
        "libx264",
        "-crf",
        "16",
        "-preset",
        preset,
        "-pix_fmt",
        "yuv420p",
    ]
    if threads:
        cmd += ["-threads", str(threads)]
    if fade > 0:
        out_at = max(0.0, length - fade)
        cmd += ["-vf", f"fade=t=in:st=0:d={fade:g},fade=t=out:st={out_at:.3f}:d={fade:g}"]
    if audio and track is not None:
        cmd += ["-map", f"0:{track['index']}", "-c:a", "aac", "-b:a", f"{audio_kbps}k"]
        if fade > 0:
            cmd += ["-af", f"afade=t=in:st=0:d={fade:g},afade=t=out:st={out_at:.3f}:d={fade:g}"]
    else:
        cmd += ["-an"]
    cmd += ["-sn", "-dn", "-movflags", "+faststart", "-progress", "pipe:1", str(out)]
    return cmd


def parse_master(master: Path, rungs: list[Rung]) -> tuple[list[dict], list[dict]]:
    """Read the bandwidth/codecs FFmpeg measured for each variant."""
    renditions: list[dict] = []
    audio: list[dict] = []
    lines = master.read_text().splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF:"):
            attrs = dict(re.findall(r'([A-Z-]+)=("[^"]*"|[^,]*)', line.split(":", 1)[1]))
            uri = lines[i + 1].strip()
            idx = int(re.match(r"v(\d+)/", uri).group(1))  # type: ignore[union-attr]
            r = rungs[idx]
            renditions.append(
                {
                    "name": r.name,
                    "height": r.height,
                    "width": r.width,
                    "codec": r.codec,
                    "bandwidth": int(attrs.get("BANDWIDTH", r.max_kbps * 1000)),
                    "avg_bandwidth": int(attrs.get("AVERAGE-BANDWIDTH", r.video_kbps * 1000)),
                    "codecs": attrs.get("CODECS", '"avc1.640028"').strip('"'),
                    "playlist": uri,
                }
            )
        elif line.startswith("#EXT-X-MEDIA:TYPE=AUDIO"):
            attrs = dict(re.findall(r'([A-Z-]+)=("[^"]*"|[^,]*)', line.split(":", 1)[1]))
            audio.append(
                {
                    "name": attrs.get("NAME", '"audio"').strip('"'),
                    "language": attrs.get("LANGUAGE", '"und"').strip('"'),
                    "playlist": attrs.get("URI", '""').strip('"'),
                    "default": attrs.get("DEFAULT", "NO") == "YES",
                }
            )
    renditions.sort(key=lambda r: -r["bandwidth"])
    return renditions, audio


def sprites(src: str, out: Path, source: Probe) -> dict:
    interval = max(1, config.get_int("transcoding.sprite_interval_seconds", 5))
    cols = config.get_int("transcoding.sprite_columns", 10)
    width = config.get_int("transcoding.sprite_thumb_width", 240)
    height = int(round(width * source.height / source.width / 2) * 2)
    rows = cols
    count = max(1, math.ceil(source.duration / interval))
    out.mkdir(parents=True, exist_ok=True)
    run(
        [
            tool("ffmpeg"),
            "-hide_banner",
            "-nostdin",
            "-y",
            "-i",
            src,
            "-vf",
            f"fps=1/{interval},scale={width}:{height}:flags=bicubic,tile={cols}x{rows}",
            "-q:v",
            "5",
            str(out / "sheet_%03d.jpg"),
        ],
        timeout=max(600, int(source.duration)),
    )
    sheets = sorted(p.name for p in out.glob("sheet_*.jpg"))
    return {
        "interval": interval,
        "columns": cols,
        "rows": rows,
        "width": width,
        "height": height,
        "count": count,
        "sheets": sheets,
    }


def poster_frame(src: str, out: Path, source: Probe) -> str:
    target = out / "poster.jpg"
    at = max(0.0, min(source.duration * 0.1, source.duration - 0.5))
    run(
        [
            tool("ffmpeg"),
            "-hide_banner",
            "-nostdin",
            "-y",
            "-ss",
            f"{at:.2f}",
            "-i",
            src,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(target),
        ],
        timeout=120,
    )
    return target.name


def upload_tree(root: Path, prefix: str) -> int:
    files = [p for p in root.rglob("*") if p.is_file()]

    def put(path: Path):
        content_type, cache = CONTENT_TYPES.get(
            path.suffix, ("application/octet-stream", storage.LONG_CACHE)
        )
        storage.upload_file(
            str(path), f"{prefix}/{path.relative_to(root).as_posix()}", content_type, cache
        )

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(put, files))
    return len(files)


class Workspace:
    def __init__(self) -> None:
        self.path = Path(tempfile.mkdtemp(prefix="netfly-transcode-"))

    def __enter__(self) -> Path:
        return self.path

    def __exit__(self, *exc) -> None:
        shutil.rmtree(self.path, ignore_errors=True)


def disk_free(path: str) -> int:
    stat = os.statvfs(path)
    return stat.f_bavail * stat.f_frsize
