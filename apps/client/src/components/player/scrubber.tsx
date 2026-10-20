"use client";

import { formatDuration } from "@netfly/ui";
import { useRef, useState } from "react";
import { cueAt, type ThumbCue } from "@/lib/player/thumbnails";

interface Marker {
  start: number;
  end: number;
  kind: "intro" | "credits";
}

/** Seek bar with buffered range, hover time, sprite-sheet thumbnail previews and chapter markers. */
export function Scrubber({
  current,
  duration,
  buffered,
  thumbnails,
  markers,
  onSeek,
  onScrubbing,
}: {
  current: number;
  duration: number;
  buffered: number;
  thumbnails: ThumbCue[];
  markers: Marker[];
  onSeek: (time: number) => void;
  onScrubbing: (active: boolean) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const timeAt = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  };
  const shown = drag ?? current;
  const pct = (t: number) => (duration ? `${(t / duration) * 100}%` : "0%");
  const preview = hover ?? drag;
  const cue = preview !== null ? cueAt(thumbnails, preview) : null;
  const previewLeft = preview !== null && bar.current ? Math.max(130, Math.min(bar.current.clientWidth - 130, (preview / duration) * bar.current.clientWidth)) : 0;

  return (
    <div className="group/scrub relative flex h-6 items-center">
      {preview !== null && duration > 0 && (
        <div className="pointer-events-none absolute bottom-7 -translate-x-1/2" style={{ left: previewLeft }}>
          {cue && (
            <div
              className="mb-2 overflow-hidden rounded-md bg-black shadow-2xl ring-2 ring-white/80"
              style={{ width: cue.w, height: cue.h, backgroundImage: `url("${cue.url}")`, backgroundPosition: `-${cue.x}px -${cue.y}px` }}
            />
          )}
          <p className="text-center text-[13px] font-semibold tabular-nums text-white drop-shadow">{formatDuration(preview)}</p>
        </div>
      )}
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${formatDuration(shown)} of ${formatDuration(duration)}`}
        onPointerMove={(e) => setHover(timeAt(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          onScrubbing(true);
          setDrag(timeAt(e.clientX));
        }}
        onPointerMoveCapture={(e) => drag !== null && setDrag(timeAt(e.clientX))}
        onPointerUp={(e) => {
          if (drag === null) return;
          onSeek(timeAt(e.clientX));
          setDrag(null);
          onScrubbing(false);
        }}
        className="relative h-[5px] w-full cursor-pointer touch-none rounded-full bg-white/25 transition-[height] duration-150 group-hover/scrub:h-[7px]"
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: pct(buffered) }} />
        {markers.map((m) => (
          <div key={m.kind} className="absolute inset-y-0 bg-white/30" style={{ left: pct(m.start), width: pct(m.end - m.start) }} aria-hidden />
        ))}
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: pct(shown) }} />
        <div
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent shadow-[0_0_0_4px_rgb(var(--accent-rgb)/0.3)] transition-transform group-hover/scrub:scale-100"
          style={{ left: pct(shown), transform: drag !== null ? "translate(-50%,-50%) scale(1.15)" : undefined }}
        />
      </div>
    </div>
  );
}
