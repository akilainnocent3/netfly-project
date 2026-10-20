"use client";

import type Hls from "hls.js";
import { AnimatePresence, m } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
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

/** Muted, looping preview (trailer, or a slice of the title) that fades in over the artwork. */
export function PreviewVideo({
  title,
  loop = true,
  className,
  showMute,
}: {
  title: TitleCard;
  loop?: boolean;
  className?: string;
  showMute?: boolean;
}) {
  const { user } = useAuth();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video || !previewsAllowed(user?.autoplay_previews)) return;
    let hls: Hls | null = null;
    let cancelled = false;
    void getPlayback(title.slug, { preview: true }).then(async (info) => {
      if (!info || cancelled) return;
      const start = () => {
        video.currentTime = info.start_at;
        void video.play().catch(() => undefined);
      };
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = info.master_url;
        video.addEventListener("loadedmetadata", start, { once: true });
        return;
      }
      const { default: HlsCtor } = await import("hls.js");
      if (cancelled || !HlsCtor.isSupported()) return;
      hls = new HlsCtor({
        startPosition: info.start_at,
        capLevelToPlayerSize: true,
        maxBufferLength: 12,
        abrEwmaDefaultEstimate: 3_000_000,
      });
      hls.loadSource(info.master_url);
      hls.attachMedia(video);
      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => void video.play().catch(() => undefined));
    });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [title.slug, user?.autoplay_previews]);

  return (
    <>
      <video
        ref={ref}
        muted={muted}
        playsInline
        loop={loop}
        preload="none"
        aria-hidden
        onPlaying={() => setPlaying(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${playing ? "opacity-100" : "opacity-0"} ${className ?? ""}`}
      />
      <AnimatePresence>
        {showMute && playing && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute right-[4vw] bottom-[18%] z-10"
          >
            <IconButton
              size="lg"
              label={muted ? "Unmute preview" : "Mute preview"}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setMuted((value) => !value);
              }}
            >
              {muted ? <VolumeX /> : <Volume2 />}
            </IconButton>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
