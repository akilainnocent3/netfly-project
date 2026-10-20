"use client";

import { m } from "framer-motion";
import { Play, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlaybackInfo } from "@/lib/playback";
import type { TitleCard } from "@/lib/types";
import { RatingButton } from "../browse/rating-button";
import { NetflyImage } from "../ui/netfly-image";

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
      onPointerUp={(e) => e.stopPropagation()}
      aria-live="polite"
      className="absolute right-[3vw] bottom-[20%] w-[min(380px,88vw)] overflow-hidden rounded-xl bg-black/85 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
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
        <p className="absolute bottom-3 left-4 text-[12px] font-bold tracking-wider text-white/70 uppercase">
          Next episode · {next.label}
        </p>
      </div>
      <div className="p-4">
        <p className="text-[17px] font-bold">{next.name}</p>
        {next.synopsis && (
          <p className="mt-1 line-clamp-2 text-[13px] text-white/65">{next.synopsis}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onPlay(false)}
            className="relative flex h-11 flex-1 items-center justify-center gap-2 overflow-hidden rounded-md bg-white font-bold text-black"
          >
            {autoplay && (
              <span
                className="absolute inset-y-0 left-0 bg-black/15 transition-[width] duration-1000 ease-linear"
                style={{ width: `${((seconds - left) / seconds) * 100}%` }}
              />
            )}
            <Play className="relative size-5 fill-current" />
            <span className="relative">
              {autoplay ? `Next episode in ${left}s` : "Play next episode"}
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel autoplay"
            className="grid size-11 place-items-center rounded-md bg-white/15 hover:bg-white/25"
          >
            <X className="size-5" />
          </button>
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
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 grid place-items-center bg-black/85 p-6 backdrop-blur-sm"
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="max-w-md text-center">
        <p className="text-[clamp(24px,3vw,34px)] font-bold">Are you still watching “{title}”?</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            autoFocus
            onClick={onContinue}
            className="rounded-md bg-white px-7 py-3 text-[16px] font-bold text-black hover:bg-white/85"
          >
            Continue watching
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-md bg-white/15 px-7 py-3 text-[16px] font-bold hover:bg-white/25"
          >
            Back to browse
          </button>
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
  const card = {
    id: info.title.id,
    slug: info.title.slug,
    title: info.title.title,
    rating: null,
  } as Pick<TitleCard, "id" | "slug" | "title" | "rating">;
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 backdrop-blur"
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="text-center">
        <p className="text-[14px] font-bold tracking-[0.2em] text-white/50 uppercase">
          You finished
        </p>
        <p className="mt-2 text-[clamp(26px,4vw,44px)] font-black">{info.title.title}</p>
        <p className="mt-8 text-[17px] font-semibold">How was it?</p>
        <div className="mt-4 flex justify-center">
          <RatingButton title={card as TitleCard} size="lg" />
        </div>
        <div className="mt-10 flex justify-center gap-3">
          <button
            type="button"
            onClick={onReplay}
            className="flex items-center gap-2 rounded-md bg-white/15 px-6 py-3 font-bold hover:bg-white/25"
          >
            <RotateCcw className="size-5" /> Watch again
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-md bg-white px-6 py-3 font-bold text-black hover:bg-white/85"
          >
            Back to browse
          </button>
        </div>
      </div>
    </m.div>
  );
}
