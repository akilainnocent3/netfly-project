"use client";

import { cn, formatDuration } from "@netfly/ui";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, m } from "framer-motion";
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronsRight,
  Gauge,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PlaybackEngine,
  type LevelInfo,
  type QualityPref,
  type TrackInfo,
} from "@/lib/player/engine";
import { parseThumbnails, type ThumbCue } from "@/lib/player/thumbnails";
import { PlaybackTracker } from "@/lib/player/tracker";
import { getPlayback, warmManifest, type PlaybackInfo } from "@/lib/playback";
import { useAuth } from "../providers/auth";
import { useConfig } from "../providers/config";
import { Button, IconButton as UiIconButton } from "../ui/button";
import { NetflyImage } from "../ui/netfly-image";
import { EpisodeDrawer } from "./episode-drawer";
import { EndScreen, NextEpisodeCard, StillWatching } from "./overlays";
import { Scrubber } from "./scrubber";

const QUALITY_KEY = "netfly-quality";
const AUTOPLAY_COUNT_KEY = "netfly-autoplay-chain";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function storedQuality(fallback: string): QualityPref {
  try {
    return (localStorage.getItem(QUALITY_KEY) as QualityPref | null) ?? (fallback as QualityPref);
  } catch {
    return fallback as QualityPref;
  }
}

type TrackOption = TrackInfo;

export function Player({ info, autoplayed }: { info: PlaybackInfo; autoplayed: boolean }) {
  const config = useConfig();
  const router = useRouter();
  const { user } = useAuth();
  const shell = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const engine = useRef<PlaybackEngine | null>(null);
  const tracker = useRef<PlaybackTracker | null>(null);
  const loadStarted = useRef(performance.now());
  const waitingSince = useRef<number | null>(null);
  const seekFrom = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ t: number; x: number } | null>(null);
  const swipe = useRef<{ x: number; y: number; time: number; active: boolean } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(info.start_at);
  const [duration, setDuration] = useState(info.duration);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [waiting, setWaiting] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [controls, setControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [levels, setLevels] = useState<LevelInfo[]>([]);
  const [activeLevel, setActiveLevel] = useState<LevelInfo | null>(null);
  const [quality, setQuality] = useState<QualityPref>(() =>
    storedQuality(user?.preferred_quality || config.str("playback.default_quality", "auto")),
  );
  const [subtitles, setSubtitles] = useState<TrackOption[]>([]);
  const [subtitle, setSubtitle] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<TrackOption[]>([]);
  const [audioTrack, setAudioTrack] = useState(0);
  const [thumbs, setThumbs] = useState<ThumbCue[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [ripple, setRipple] = useState<{ side: "left" | "right"; key: number } | null>(null);
  const [nextDismissed, setNextDismissed] = useState(false);
  const [ended, setEnded] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [stillWatching, setStillWatching] = useState(false);

  const ep = info.episode;
  const seekStep = config.num("playback.seek_step_seconds", 10);
  const hideAfter = config.num("playback.controls_hide_ms", 3000);
  const creditsAt =
    ep?.credits_start ??
    (info.next ? duration - config.num("playback.credits_fallback_seconds", 30) : null);
  const inIntro =
    !!ep &&
    ep.intro_start !== null &&
    ep.intro_end !== null &&
    current >= ep.intro_start &&
    current < ep.intro_end - 1;
  const showNext =
    !!info.next && creditsAt !== null && current >= creditsAt && !nextDismissed && !ended;
  const exitHref = `/title/${info.title.slug}`;

  // -- engine + tracking --------------------------------------------------------
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // "Are you still watching?" after N autoplayed episodes in a row.
    let chain = 0;
    try {
      chain = autoplayed ? Number(sessionStorage.getItem(AUTOPLAY_COUNT_KEY) ?? 0) + 1 : 0;
      sessionStorage.setItem(AUTOPLAY_COUNT_KEY, String(chain));
    } catch {
      /* ignore */
    }
    const askStill = autoplayed && chain >= config.num("playback.still_watching_after_episodes", 3);
    if (askStill) setStillWatching(true);

    const t = new PlaybackTracker(
      {
        sessionId: info.session_id,
        titleId: info.title.id,
        episodeId: ep?.id ?? null,
        progressEvery: config.num("playback.progress_save_seconds", 10),
        flushEvery: config.num("playback.event_flush_seconds", 15),
      },
      el,
      () => engine.current?.bandwidth ?? 0,
    );
    tracker.current = t;
    t.start();
    loadStarted.current = performance.now();

    const e = new PlaybackEngine(el, {
      src: info.master_url,
      startAt: info.start_at,
      defaultEstimate: config.num("playback.default_bandwidth_estimate", 6_000_000),
      bandwidthFactor: config.num("playback.abr_bandwidth_factor", 0.9),
      bandwidthUpFactor: config.num("playback.abr_bandwidth_up_factor", 0.8),
      maxBuffer: config.num("playback.max_buffer_seconds", 60),
      backBuffer: config.num("playback.back_buffer_seconds", 30),
      dataSaverMaxHeight: config.num("playback.data_saver_max_height", 480),
      quality,
      refreshSource: async () =>
        (await getPlayback(info.title.slug, { episode: ep?.id ?? null }))?.master_url ?? null,
      onLevels: setLevels,
      onLevelSwitched: (level, auto) => {
        setActiveLevel(level);
        if (level)
          t.track("quality", { value: level.bitrate, data: { height: level.height, auto } });
      },
      onFatal: (message) => {
        setFatal(message);
        t.track("error", { data: { message } });
      },
      onTracks: ({ subtitles: subs, audio }) => {
        setSubtitles(subs);
        setAudioTracks(audio);
        const preferred = user?.subtitles_language;
        const hls = engine.current?.hls;
        const idx = preferred ? subs.findIndex((s) => s.lang.startsWith(preferred)) : -1;
        if (hls && idx >= 0 && hls.subtitleTrack !== idx) {
          hls.subtitleTrack = idx;
          setSubtitle(idx);
        }
      },
    });
    engine.current = e;
    void e.start().then(() => {
      if (!askStill) void el.play().catch(() => setPlaying(false));
    });

    const onPageHide = () => t.stop();
    const onVisibility = () => document.visibilityState === "hidden" && void t.saveProgress(true);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      t.stop();
      e.destroy();
    };
    // The engine is (re)created per playback session only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.session_id]);

  useEffect(() => {
    let alive = true;
    fetch(info.thumbnails_url)
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => alive && text && setThumbs(parseThumbnails(text, location.href)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [info.thumbnails_url]);

  // Warm the next episode while the credits roll.
  useEffect(() => {
    if (showNext && info.next)
      void getPlayback(info.title.slug, { episode: info.next.id }).then(warmManifest);
  }, [showNext, info.next, info.title.slug]);

  // -- controls visibility ---------------------------------------------------------
  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (video.current && !video.current.paused) setControls(false);
    }, hideAfter);
    try {
      sessionStorage.setItem(AUTOPLAY_COUNT_KEY, "0"); // any interaction resets the autoplay chain
    } catch {
      /* ignore */
    }
  }, [hideAfter]);
  useEffect(() => {
    if (!playing) setControls(true);
    else poke();
  }, [playing, poke]);

  // -- actions -------------------------------------------------------------------
  const togglePlay = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);
  const seekTo = useCallback(
    (time: number) => {
      const el = video.current;
      if (!el) return;
      seekFrom.current = el.currentTime;
      el.currentTime = Math.max(0, Math.min(time, (el.duration || duration) - 0.5));
      setCurrent(el.currentTime);
    },
    [duration],
  );
  const seekBy = useCallback(
    (delta: number) => video.current && seekTo(video.current.currentTime + delta),
    [seekTo],
  );
  const setVol = useCallback((v: number) => {
    const el = video.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, v));
    el.muted = el.volume === 0;
  }, []);
  const toggleFullscreen = useCallback(async () => {
    const el = shell.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    const iosVideo = video.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (!el.requestFullscreen && iosVideo.webkitEnterFullscreen) {
      iosVideo.webkitEnterFullscreen();
      return;
    }
    await el.requestFullscreen?.().catch(() => undefined);
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.("landscape").catch(() => undefined);
  }, []);
  const togglePip = useCallback(async () => {
    const el = video.current;
    if (!el) return;
    if (document.pictureInPictureElement)
      await document.exitPictureInPicture().catch(() => undefined);
    else await el.requestPictureInPicture?.().catch(() => undefined);
  }, []);
  const chooseQuality = (q: QualityPref) => {
    setQuality(q);
    engine.current?.applyQuality(q);
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      /* ignore */
    }
  };
  const chooseSubtitle = useCallback((id: number) => {
    const hls = engine.current?.hls;
    if (hls) {
      hls.subtitleTrack = id;
      hls.subtitleDisplay = id >= 0;
    } else if (video.current) {
      Array.from(video.current.textTracks).forEach(
        (track, i) => (track.mode = i === id ? "showing" : "disabled"),
      );
    }
    setSubtitle(id);
  }, []);
  const playNext = useCallback(
    (auto: boolean) => {
      if (!info.next) return;
      router.replace(
        `/watch/${info.title.slug}?episode=${info.next.id}${auto ? "&autoplay=1" : ""}`,
      );
    },
    [info.next, info.title.slug, router],
  );

  // -- keyboard ---------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === " " || key === "k") togglePlay();
      else if (key === "j" || key === "arrowleft") seekBy(-seekStep);
      else if (key === "l" || key === "arrowright") seekBy(seekStep);
      else if (key === "arrowup") setVol((video.current?.volume ?? 1) + 0.1);
      else if (key === "arrowdown") setVol((video.current?.volume ?? 1) - 0.1);
      else if (key === "f") void toggleFullscreen();
      else if (key === "m" && video.current) video.current.muted = !video.current.muted;
      else if (key === "c" && subtitles.length) chooseSubtitle(subtitle >= 0 ? -1 : 0);
      else if (key === "escape" && drawer) setDrawer(false);
      else return;
      e.preventDefault();
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    togglePlay,
    seekBy,
    seekStep,
    setVol,
    toggleFullscreen,
    chooseSubtitle,
    subtitle,
    subtitles.length,
    drawer,
    poke,
  ]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // -- touch gestures: double-tap sides to seek, horizontal swipe to scrub -----------------
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      togglePlay();
      return;
    }
    const s = swipe.current;
    swipe.current = null;
    if (s?.active) return;
    const now = Date.now();
    const width = shell.current?.clientWidth ?? 1;
    const side = e.clientX < width * 0.4 ? "left" : e.clientX > width * 0.6 ? "right" : null;
    if (lastTap.current && now - lastTap.current.t < 300 && side) {
      seekBy(side === "left" ? -seekStep : seekStep);
      setRipple({ side, key: now });
      lastTap.current = null;
      return;
    }
    lastTap.current = { t: now, x: e.clientX };
    setTimeout(() => {
      if (lastTap.current?.t === now) {
        setControls((c) => !c);
        if (!controls) poke();
      }
    }, 280);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse")
      swipe.current = {
        x: e.clientX,
        y: e.clientY,
        time: video.current?.currentTime ?? 0,
        active: false,
      };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      poke();
      return;
    }
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.active && Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(e.clientY - s.y)) s.active = true;
    if (s.active) {
      const width = shell.current?.clientWidth ?? 1;
      seekTo(s.time + (dx / width) * Math.min(duration, 180));
      setControls(true);
    }
  };

  const markers = useMemo(() => {
    const list: Array<{ start: number; end: number; kind: "intro" | "credits" }> = [];
    if (ep?.intro_start != null && ep.intro_end != null)
      list.push({ start: ep.intro_start, end: ep.intro_end, kind: "intro" });
    return list;
  }, [ep]);

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const qualityLabel =
    quality === "auto"
      ? `Auto${activeLevel ? ` · ${activeLevel.height}p` : ""}`
      : quality === "data_saver"
        ? "Data saver"
        : `${quality}p`;
  const heights = [...new Set(levels.map((l) => l.height))].sort((a, b) => b - a);

  return (
    <div
      ref={shell}
      className={cn("fixed inset-0 bg-black select-none", !controls && playing && "cursor-none")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <video
        ref={video}
        className="absolute inset-0 h-full w-full object-contain"
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        poster={undefined}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
          tracker.current?.track("play");
        }}
        onPause={() => {
          setPlaying(false);
          tracker.current?.track("pause");
          void tracker.current?.saveProgress();
        }}
        onPlaying={() => {
          if (loadStarted.current) {
            tracker.current?.track("start", {
              value: Math.round(performance.now() - loadStarted.current),
              data: { height: activeLevel?.height },
            });
            loadStarted.current = 0;
          }
          if (waitingSince.current) {
            tracker.current?.track("rebuffer", {
              value: Math.round(performance.now() - waitingSince.current),
            });
            waitingSince.current = null;
          }
          setWaiting(false);
        }}
        onWaiting={() => {
          setWaiting(true);
          if (!loadStarted.current && !video.current?.seeking)
            waitingSince.current = performance.now();
        }}
        onSeeked={() => {
          if (seekFrom.current !== null) {
            tracker.current?.track("seek", { data: { from: seekFrom.current } });
            seekFrom.current = null;
          }
          waitingSince.current = null;
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          tracker.current?.tick();
          if (!scrubbing) setCurrent(el.currentTime);
          if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
        }}
        onDurationChange={(e) =>
          Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)
        }
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
        onEnded={() => {
          setEnded(true);
          tracker.current?.track("complete");
          void tracker.current?.saveProgress();
          if (info.next && !nextDismissed && user?.autoplay_next !== false) playNext(true);
        }}
      />

      {/* Buffering */}
      <AnimatePresence>
        {waiting && !fatal && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.25 }}
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <div
              className="border-t-accent size-16 animate-spin rounded-full border-[3px] border-white/20"
              aria-label="Loading"
            />
          </m.div>
        )}
      </AnimatePresence>

      {/* Double-tap seek ripple */}
      <AnimatePresence>
        {ripple && (
          <m.div
            key={ripple.key}
            initial={{ opacity: 0.8, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.6 }}
            onAnimationComplete={() => setRipple(null)}
            className={cn(
              "pointer-events-none absolute top-1/2 grid size-28 -translate-y-1/2 place-items-center rounded-full bg-white/15",
              ripple.side === "left" ? "left-[12%]" : "right-[12%]",
            )}
          >
            {ripple.side === "left" ? (
              <RotateCcw className="size-8" />
            ) : (
              <RotateCw className="size-8" />
            )}
            <span className="text-meta absolute bottom-5 font-bold">{seekStep}s</span>
          </m.div>
        )}
      </AnimatePresence>

      {/* Chrome */}
      <m.div
        initial={false}
        animate={{ opacity: controls || !playing ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "pointer-events-none absolute inset-0",
          (controls || !playing) && "[&>*]:pointer-events-auto",
        )}
      >
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
        <div
          className="absolute top-0 right-0 left-0 flex items-center gap-4 px-[3vw] pt-[max(env(safe-area-inset-top),20px)]"
          onPointerUp={(e) => e.stopPropagation()}
        >
          <PlayerButton label="Back" onClick={() => router.push(exitHref)}>
            <ArrowLeft />
          </PlayerButton>
          <div className="min-w-0">
            <p className="text-body md:text-lead truncate font-bold">{info.title.title}</p>
            {ep && (
              <p className="text-meta md:text-body truncate text-white/70">
                S{ep.season_number}:E{ep.number} · {ep.name}
              </p>
            )}
          </div>
        </div>

        <div
          className="absolute inset-x-0 bottom-0 px-[3vw] pb-[max(env(safe-area-inset-bottom),18px)]"
          onPointerUp={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Scrubber
                current={current}
                duration={duration}
                buffered={buffered}
                thumbnails={thumbs}
                markers={markers}
                onSeek={(t) => {
                  seekTo(t);
                  poke();
                }}
                onScrubbing={setScrubbing}
              />
            </div>
            <span className="text-meta md:text-body w-24 text-right font-semibold text-white/85 tabular-nums">
              -{formatDuration(Math.max(0, duration - current))}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1 md:gap-3">
            <PlayerButton label={playing ? "Pause (k)" : "Play (k)"} onClick={togglePlay} big>
              {playing ? (
                <Pause className="size-8 fill-current" />
              ) : (
                <Play className="size-8 fill-current" />
              )}
            </PlayerButton>
            <PlayerButton label={`Back ${seekStep} seconds (j)`} onClick={() => seekBy(-seekStep)}>
              <span className="relative">
                <RotateCcw className="size-7" />
                <span className="text-caption absolute inset-0 grid place-items-center pt-0.5 font-bold">
                  {seekStep}
                </span>
              </span>
            </PlayerButton>
            <PlayerButton
              label={`Forward ${seekStep} seconds (l)`}
              onClick={() => seekBy(seekStep)}
            >
              <span className="relative">
                <RotateCw className="size-7" />
                <span className="text-caption absolute inset-0 grid place-items-center pt-0.5 font-bold">
                  {seekStep}
                </span>
              </span>
            </PlayerButton>
            <div className="group/vol hidden items-center md:flex">
              <PlayerButton
                label={muted ? "Unmute (m)" : "Mute (m)"}
                onClick={() => video.current && (video.current.muted = !video.current.muted)}
              >
                <VolumeIcon className="size-7" />
              </PlayerButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => setVol(Number(e.target.value))}
                className="w-0 accent-[var(--accent)] opacity-0 transition-all duration-200 group-hover/vol:w-24 group-hover/vol:opacity-100 focus:w-24 focus:opacity-100"
              />
            </div>
            <div className="ml-auto flex items-center gap-1 md:gap-2">
              {info.next && (
                <PlayerButton label="Next episode" onClick={() => playNext(false)}>
                  <SkipForward className="size-7" />
                </PlayerButton>
              )}
              {ep && (
                <PlayerButton label="Episodes" onClick={() => setDrawer(true)}>
                  <ListVideo className="size-7" />
                </PlayerButton>
              )}
              <Menu label="Subtitles and audio (c)" icon={<Captions className="size-7" />}>
                <MenuLabel>Subtitles</MenuLabel>
                <MenuItem active={subtitle === -1} onSelect={() => chooseSubtitle(-1)}>
                  Off
                </MenuItem>
                {subtitles.map((s) => (
                  <MenuItem
                    key={s.id}
                    active={subtitle === s.id}
                    onSelect={() => chooseSubtitle(s.id)}
                  >
                    {s.label}
                  </MenuItem>
                ))}
                {audioTracks.length > 1 && (
                  <>
                    <MenuLabel>Audio</MenuLabel>
                    {audioTracks.map((a) => (
                      <MenuItem
                        key={a.id}
                        active={audioTrack === a.id}
                        onSelect={() => {
                          if (engine.current?.hls) engine.current.hls.audioTrack = a.id;
                          setAudioTrack(a.id);
                        }}
                      >
                        {a.label}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
              <Menu label="Playback speed" icon={<Gauge className="size-7" />}>
                <MenuLabel>Speed</MenuLabel>
                {SPEEDS.map((s) => (
                  <MenuItem
                    key={s}
                    active={rate === s}
                    onSelect={() => video.current && (video.current.playbackRate = s)}
                  >
                    {s === 1 ? "Normal" : `${s}×`}
                  </MenuItem>
                ))}
              </Menu>
              {!engine.current?.native && (
                <Menu
                  label={`Quality: ${qualityLabel}`}
                  icon={<Settings className="size-7" />}
                  badge={
                    activeLevel && activeLevel.height >= 1080
                      ? activeLevel.height >= 2160
                        ? "4K"
                        : "HD"
                      : undefined
                  }
                >
                  <MenuLabel>Quality</MenuLabel>
                  <MenuItem active={quality === "auto"} onSelect={() => chooseQuality("auto")}>
                    <span>Auto — highest quality</span>
                    {quality === "auto" && activeLevel && (
                      <span className="ml-3 text-white/50">{activeLevel.height}p</span>
                    )}
                  </MenuItem>
                  {heights.map((h) => (
                    <MenuItem
                      key={h}
                      active={quality === String(h)}
                      onSelect={() => chooseQuality(String(h) as QualityPref)}
                    >
                      {h >= 2160 ? "2160p 4K" : `${h}p`}
                      {h >= 1080 && h < 2160 ? " HD" : ""}
                    </MenuItem>
                  ))}
                  <MenuItem
                    active={quality === "data_saver"}
                    onSelect={() => chooseQuality("data_saver")}
                  >
                    Data saver
                  </MenuItem>
                </Menu>
              )}
              {typeof document !== "undefined" && document.pictureInPictureEnabled && (
                <PlayerButton label="Picture in picture" onClick={() => void togglePip()}>
                  <PictureInPicture2 className="size-7" />
                </PlayerButton>
              )}
              <PlayerButton
                label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <Minimize className="size-7" /> : <Maximize className="size-7" />}
              </PlayerButton>
            </div>
          </div>
        </div>
      </m.div>

      {/* Skip Intro */}
      <AnimatePresence>
        {inIntro && (
          <m.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute right-[3vw] bottom-[22%]"
            onPointerUp={(e) => e.stopPropagation()}
          >
            <Button
              variant="secondary"
              size="lg"
              className="border border-white/60 bg-black/60 hover:bg-white hover:text-black"
              onClick={() => ep?.intro_end != null && seekTo(ep.intro_end)}
            >
              Skip Intro <ChevronsRight className="size-5" />
            </Button>
          </m.div>
        )}
      </AnimatePresence>

      {showNext && info.next && (
        <NextEpisodeCard
          next={info.next}
          seconds={config.num("playback.next_episode_countdown_seconds", 10)}
          autoplay={user?.autoplay_next !== false}
          onPlay={(auto) => playNext(auto)}
          onCancel={() => setNextDismissed(true)}
        />
      )}
      {ended && !info.next && (
        <EndScreen
          info={info}
          onReplay={() => {
            seekTo(0);
            void video.current?.play();
          }}
          onExit={() => router.push("/browse")}
        />
      )}
      {stillWatching && (
        <StillWatching
          title={info.title.title}
          onContinue={() => {
            setStillWatching(false);
            try {
              sessionStorage.setItem(AUTOPLAY_COUNT_KEY, "0");
            } catch {
              /* ignore */
            }
            void video.current?.play();
          }}
          onExit={() => router.push("/browse")}
        />
      )}
      {fatal && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center">
          <div>
            <p className="text-h3 font-bold">{fatal}</p>
            <Button variant="play" className="mt-5" onClick={() => location.reload()}>
              Try again
            </Button>
          </div>
        </div>
      )}
      {ep && (
        <EpisodeDrawer
          open={drawer}
          onOpenChange={setDrawer}
          slug={info.title.slug}
          season={ep.season_number}
          currentEpisode={ep.id}
        />
      )}
      {!playing && current < 1 && info.title.backdrop && waiting && (
        <div className="pointer-events-none absolute inset-0 -z-0 opacity-30">
          <NetflyImage
            image={info.title.backdrop}
            alt=""
            sizes="100vw"
            className="object-cover blur-sm"
          />
        </div>
      )}
    </div>
  );
}

/** Player chrome button: the shared round ghost IconButton, sized for the player. */
function PlayerButton({
  label,
  onClick,
  children,
  big,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  big?: boolean;
}) {
  return (
    <UiIconButton
      variant="ghost"
      size="lg"
      label={label}
      onClick={onClick}
      className={cn("hover:scale-110 [&_svg]:size-7", big && "size-14 [&_svg]:size-8")}
    >
      {children}
    </UiIconButton>
  );
}

function Menu({
  label,
  icon,
  children,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <UiIconButton
          variant="ghost"
          size="lg"
          label={label}
          className="relative hover:scale-110 data-[state=open]:bg-white/10 [&_svg]:size-7"
        >
          {icon}
          {badge && (
            <span className="bg-accent text-accent-fg text-caption absolute top-1.5 right-1 rounded px-1 leading-[14px] font-black">
              {badge}
            </span>
          )}
        </UiIconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={10}
          className="text-body z-[120] min-w-56 rounded-xl border border-white/10 bg-black/90 p-1.5 text-white shadow-2xl backdrop-blur-xl"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Label className="text-meta px-3 pt-2 pb-1 font-bold tracking-wider text-white/50 uppercase">
      {children}
    </DropdownMenu.Label>
  );
}

function MenuItem({
  children,
  active,
  onSelect,
}: {
  children: React.ReactNode;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 outline-none data-[highlighted]:bg-white/10"
    >
      <Check className={cn("size-4 shrink-0", active ? "text-accent" : "invisible")} />
      <span className="flex flex-1 items-center justify-between">{children}</span>
    </DropdownMenu.Item>
  );
}
