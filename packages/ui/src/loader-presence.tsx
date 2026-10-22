"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderTimeline, type LoaderPhase, type LoaderTiming } from "./loader-timeline";
import { LazyLogoLoader } from "./logo-loader-lazy";
import type { LogoLoaderProps } from "./logo-mark";

/**
 * Phase of a loader for work that is `active`: hidden for the first `delay` ms, then visible
 * for at least `minDuration` ms, then `exiting` for the 150 ms fade.
 */
export function useLoaderPresence(active: boolean, timing?: LoaderTiming): LoaderPhase {
  const [phase, setPhase] = useState<LoaderPhase>("hidden");
  const timeline = useRef<LoaderTimeline | null>(null);
  const { delay, minDuration, exit } = timing ?? {};
  useEffect(() => {
    const t = new LoaderTimeline(setPhase, { delay, minDuration, exit });
    timeline.current = t;
    return () => t.dispose();
  }, [delay, minDuration, exit]);
  useEffect(() => {
    timeline.current?.set(active);
  }, [active]);
  return phase;
}

/**
 * <LogoLoader> that appears after `delay`, stays at least `minDuration` and fades out. Use it
 * where loading state toggles on the client (saving, buffering, auth boot); a server-rendered
 * fallback (loading.tsx) uses <LogoLoader> directly, whose delay is pure CSS.
 */
export function LoaderPresence({
  active,
  delay = 200,
  minDuration = 400,
  ...props
}: Omit<LogoLoaderProps, "exiting"> & { active: boolean; minDuration?: number }) {
  const phase = useLoaderPresence(active, { delay, minDuration });
  if (phase === "hidden") return null;
  // The delay has already elapsed in JS: appear now.
  return <LazyLogoLoader {...props} delay={0} exiting={phase === "exiting"} />;
}
