"use client";

import { cn } from "@netfly/ui";
import { ChevronsRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BRAND } from "../brand/logo";
import { useConfig } from "../providers/config";
import { Button } from "../ui/button";

const LOAD_TIMEOUT_MS = 1500;
const REDUCED_MS = 600;
const FADE_MS = 200;

/**
 * The brand ident before a title, full screen on black WITH sound (Play was the
 * user gesture). The title is already buffering underneath; `onDone` starts it.
 * Never counted as watch time: the content video stays paused until then.
 */
export function IntroPreroll({
  src,
  reduced,
  skippable,
  skipAfterMs,
  onDone,
}: {
  src: string;
  reduced: boolean;
  skippable: boolean;
  skipAfterMs: number;
  onDone: () => void;
}) {
  const config = useConfig();
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [canSkip, setCanSkip] = useState(skippable && skipAfterMs <= 0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useRef(() => {
    if (done.current) return;
    done.current = true;
    setLeaving(true);
    video.current?.pause();
    onDoneRef.current();
  }).current;

  useEffect(() => {
    if (!skippable || skipAfterMs <= 0) return;
    const t = setTimeout(() => setCanSkip(true), skipAfterMs);
    return () => clearTimeout(t);
  }, [skippable, skipAfterMs]);

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(finish, REDUCED_MS);
      return () => clearTimeout(t);
    }
    const el = video.current;
    if (!el) return;
    let started = false;
    // A slow or broken intro must never hold the title back.
    const timeout = setTimeout(() => !started && finish(), LOAD_TIMEOUT_MS);
    const onPlaying = () => {
      started = true;
    };
    el.addEventListener("playing", onPlaying);
    el.addEventListener("error", finish);
    el.play().catch(() => {
      // Sound blocked (e.g. a deep link with no prior gesture): play it muted instead.
      el.muted = true;
      el.play().catch(finish);
    });
    return () => {
      clearTimeout(timeout);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("error", finish);
    };
  }, [reduced, finish]);

  // Space / Enter / Esc skip (the player's own shortcuts are off while this plays).
  useEffect(() => {
    if (!canSkip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSkip, finish]);

  return (
    <div
      data-testid="intro-preroll"
      className={cn(
        "absolute inset-0 z-[60] grid place-items-center bg-black transition-opacity ease-out",
        leaving ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {reduced ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={config.str("branding.logo_url", BRAND.logo)}
          alt=""
          className="w-[min(60vw,420px)]"
        />
      ) : (
        <video
          ref={video}
          src={src}
          aria-hidden
          playsInline
          preload="auto"
          disablePictureInPicture
          onEnded={finish}
          className="h-full w-full object-contain"
        />
      )}
      {canSkip && !leaving && (
        <div className="absolute right-[3vw] bottom-[12%]">
          <Button
            variant="secondary"
            size="lg"
            className="border border-white/60 bg-black/60 hover:bg-white hover:text-black"
            onClick={finish}
          >
            Skip <ChevronsRight className="size-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
