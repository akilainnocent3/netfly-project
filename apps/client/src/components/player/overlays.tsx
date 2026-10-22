"use client";

import { m } from "framer-motion";
import { Play, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlaybackInfo } from "@/lib/playback";
import { RatingButton } from "../browse/rating-button";
import { Button, IconButton } from "../ui/button";
import { NetflyImage } from "../ui/netfly-image";
import { useRouteChangePending } from "@/lib/use-navigate";

type Next = NonNullable<PlaybackInfo["next"]>;

/** Credits card with a cancellable countdown into the next episode. */
export function NextEpisodeCard({
  next,
  seconds,
  autoplay,
  onPlay,
  onCancel,
}: {
  next: Next;
  seconds: number;
  autoplay: boolean;
  onPlay: (auto: boolean) => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!autoplay) return;
    if (left <= 0) {
      onPlay(true);
      return;
    }
    const timer = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, autoplay, onPlay]);

  return (
    <m.aside
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      onPointerUp={(e) => e.stopPropagation()}
      aria-live="polite"
      className="absolute right-[3vw] bottom-[20%] w-[min(380px,88vw)] overflow-hidden rounded-md bg-black/85 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
    >
      <div className="relative aspect-video">
        <NetflyImage
          image={next.thumbnail}
          alt=""
          sizes="380px"
          className="object-cover"
          fallback={<div className="bg-surface absolute inset-0" />}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <p className="text-caption absolute bottom-3 left-4 font-bold tracking-wider text-white/70 uppercase">
          Next episode · {next.label}
        </p>
      </div>
      <div className="p-4">
        <p className="text-lead font-bold">{next.name}</p>
        {next.synopsis && <p className="text-meta text-muted mt-1 line-clamp-2">{next.synopsis}</p>}
        <div className="mt-4 flex gap-2">
          <Button
            variant="play"
            className="relative flex-1 overflow-hidden"
            icon={<Play className="fill-current" />}
            onClick={() => onPlay(false)}
          >
            {autoplay && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-black/15 transition-[width] duration-1000 ease-linear"
                style={{ width: `${((seconds - left) / seconds) * 100}%` }}
              />
            )}
            <span className="relative">
              {autoplay ? `Next episode in ${left}s` : "Play next episode"}
            </span>
          </Button>
          <IconButton
            variant="ghost"
            size="lg"
            label="Cancel autoplay"
            onClick={onCancel}
            className="rounded-md bg-white/15"
          >
            <X />
          </IconButton>
        </div>
      </div>
    </m.aside>
  );
}

/** Shown after N autoplayed episodes in a row (config) — respectful and saves bandwidth. */
export function StillWatching({
  title,
  onContinue,
  onExit,
}: {
  title: string;
  onContinue: () => void;
  onExit: () => void;
}) {
  const leaving = useRouteChangePending();
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 grid place-items-center bg-black/85 p-6 backdrop-blur-sm"
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="max-w-md text-center">
        <p className="text-h1 font-bold">Are you still watching “{title}”?</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="play" size="lg" autoFocus onClick={onContinue}>
            Continue watching
          </Button>
          <Button
            variant="secondary"
            size="lg"
            loading={leaving.pending}
            onClick={() => {
              leaving.mark();
              onExit();
            }}
          >
            Back to browse
          </Button>
        </div>
      </div>
    </m.div>
  );
}

/** End of a movie / last episode: rate it in one tap, replay, or go back. */
export function EndScreen({
  info,
  onReplay,
  onExit,
}: {
  info: PlaybackInfo;
  onReplay: () => void;
  onExit: () => void;
}) {
  const leaving = useRouteChangePending();
  const card = { id: info.title.id, slug: info.title.slug, title: info.title.title, rating: null };
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 backdrop-blur"
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="text-center">
        <p className="text-meta font-bold tracking-[0.2em] text-white/50 uppercase">You finished</p>
        <p className="text-title mt-2 font-black">{info.title.title}</p>
        <p className="text-lead mt-8 font-semibold">How was it?</p>
        <div className="mt-4 flex justify-center">
          <RatingButton title={card} size="lg" />
        </div>
        <div className="mt-10 flex justify-center gap-3">
          <Button variant="secondary" size="lg" icon={<RotateCcw />} onClick={onReplay}>
            Watch again
          </Button>
          <Button
            variant="accent"
            size="lg"
            loading={leaving.pending}
            onClick={() => {
              leaving.mark();
              onExit();
            }}
          >
            Back to browse
          </Button>
        </div>
      </div>
    </m.div>
  );
}
