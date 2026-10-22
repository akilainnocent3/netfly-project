"use client";

import { LoaderPresence } from "@netfly/ui";
import type Hls from "hls.js";
import { AnimatePresence, m } from "framer-motion";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPlayback, warmManifest } from "@/lib/playback";
import type { TitleCard } from "@/lib/types";
import { useAuth } from "../providers/auth";
import { IconButton } from "../ui/button";

export function prefetchPlayback(title: TitleCard): void {
  if (!title.has_preview) return;
  void getPlayback(title.slug, { preview: true });
  void getPlayback(title.slug, { episode: title.context?.episode_id ?? null }).then(warmManifest);
}

function previewsAllowed(autoplayPreviews: boolean | undefined): boolean {
  if (autoplayPreviews === false) return false;
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !connection?.saveData;
}

export type PreviewState = "idle" | "playing" | "ended";

/**
 * Muted preview (trailer, or a slice of the title) that fades in over the artwork.
 * Starts after `delayMs`, pauses while scrolled out of view or while the tab is hidden, and —
 * when it doesn't loop — fades back to the artwork at the end, offering Replay.
 */
export function PreviewVideo({
  title,
  loop = true,
  className,
  showMute,
  delayMs = 0,
  onStateChange,
  controlsClassName = "absolute right-[4vw] bottom-[18%] z-10",
  loaderClassName = "absolute top-2 right-2 z-10",
}: {
  title: TitleCard;
  loop?: boolean;
  className?: string;
  showMute?: boolean;
  delayMs?: number;
  onStateChange?: (state: PreviewState) => void;
  controlsClassName?: string;
  /** Where the small loader sits while the preview warms up: a corner, never the centre. */
  loaderClassName?: string;
}) {
  const { user } = useAuth();
  const ref = useRef<HTMLVideoElement>(null);
  const startAt = useRef(0);
  const [state, setStateRaw] = useState<PreviewState>("idle");
  const [muted, setMuted] = useState(true);
  const [warming, setWarming] = useState(false);
  const onState = useRef(onStateChange);
  onState.current = onStateChange;
  const setState = (next: PreviewState) => {
    setStateRaw(next);
    onState.current?.(next);
  };

  useEffect(() => {
    const video = ref.current;
    if (!video || !previewsAllowed(user?.autoplay_previews)) return;
    let hls: Hls | null = null;
    let cancelled = false;
    let visible = true;
    const canPlay = () => visible && document.visibilityState === "visible";
    const resume = () => {
      if (canPlay() && video.src && !video.ended) void video.play().catch(() => undefined);
      else video.pause();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = (entry?.intersectionRatio ?? 0) > 0.35;
        resume();
      },
      { threshold: [0, 0.35, 0.6] },
    );
    observer.observe(video);
    document.addEventListener("visibilitychange", resume);

    const timer = setTimeout(() => {
      void getPlayback(title.slug, { preview: true }).then(async (info) => {
        if (!info || cancelled) return;
        startAt.current = info.start_at;
        setWarming(true);
        const start = () => {
          video.currentTime = info.start_at;
          if (canPlay()) void video.play().catch(() => undefined);
        };
        // hls.js wherever MSE exists (as the player does); native HLS only as the fallback (iOS).
        // Desktop Chrome now also answers canPlayType for HLS, so asking that first is wrong.
        const { default: HlsCtor } = await import("hls.js");
        if (cancelled) return;
        if (!HlsCtor.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = info.master_url;
            video.addEventListener("loadedmetadata", start, { once: true });
          } else setWarming(false);
          return;
        }
        hls = new HlsCtor({
          startPosition: info.start_at,
          capLevelToPlayerSize: true,
          maxBufferLength: 12,
          abrEwmaDefaultEstimate: 3_000_000,
        });
        hls.loadSource(info.master_url);
        hls.attachMedia(video);
        hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          if (canPlay()) void video.play().catch(() => undefined);
        });
      });
    }, delayMs);
    return () => {
      cancelled = true;
      setWarming(false);
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
      hls?.destroy();
    };
  }, [title.slug, user?.autoplay_previews, delayMs]);

  const replay = () => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = startAt.current;
    void video.play().catch(() => undefined);
  };

  return (
    <>
      <video
        ref={ref}
        muted={muted}
        playsInline
        loop={loop}
        preload="none"
        aria-hidden
        onPlaying={() => {
          setWarming(false);
          setState("playing");
        }}
        onEnded={() => setState("ended")}
        onError={() => setWarming(false)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${state === "playing" ? "opacity-100" : "opacity-0"} ${className ?? ""}`}
      />
      <div className={loaderClassName}>
        <LoaderPresence active={warming && state === "idle"} size="sm" decorative />
      </div>
      <AnimatePresence>
        {showMute && state !== "idle" && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={controlsClassName}
          >
            <IconButton
              size="lg"
              label={
                state === "ended" ? "Replay preview" : muted ? "Unmute preview" : "Mute preview"
              }
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (state === "ended") replay();
                else setMuted((value) => !value);
              }}
            >
              {state === "ended" ? <RotateCcw /> : muted ? <VolumeX /> : <Volume2 />}
            </IconButton>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
