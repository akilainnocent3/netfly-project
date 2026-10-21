"use client";

import { cn } from "@netfly/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_INTRO_1080, DEFAULT_INTRO_720, type AppIntroState } from "@/lib/intro";
import { useConfig } from "../providers/config";
import { BRAND } from "./logo";

const MAX_MS = 5000;
const LOGO_MS = 800;
const REDUCED_MS = 600;
const FADE_MS = 300;

/**
 * App-open splash. The inline boot script (root layout) already decided whether it
 * plays and covered the first paint in black (`<html data-intro>`); this plays the
 * muted ident on top while the page loads underneath, then fades away on `ended`,
 * any tap/click/key, or after 5 s at most.
 */
export function IntroSplash() {
  const config = useConfig();
  const [state, setState] = useState<AppIntroState>("");
  const [logoOnly, setLogoOnly] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const finished = useRef(false);
  const video = useRef<HTMLVideoElement>(null);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    document.documentElement.removeAttribute("data-intro");
    setLeaving(true);
    setTimeout(() => setGone(true), FADE_MS);
  }, []);

  useEffect(() => {
    const decided = (document.documentElement.getAttribute("data-intro") ?? "") as AppIntroState;
    if (!decided) {
      setGone(true);
      return;
    }
    setState(decided);
    setLogoOnly(decided === "logo");
    const cap = setTimeout(finish, decided === "logo" ? REDUCED_MS : MAX_MS);
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      clearTimeout(cap);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [finish]);

  // Autoplay (muted) is allowed everywhere; if a browser still refuses, show the logo briefly.
  useEffect(() => {
    if (state !== "1080" && state !== "720") return;
    const el = video.current;
    if (!el) return;
    const fallback = () => {
      if (finished.current) return;
      setLogoOnly(true);
      setTimeout(finish, LOGO_MS);
    };
    el.play().catch(fallback);
    el.addEventListener("error", fallback, { once: true });
    return () => el.removeEventListener("error", fallback);
  }, [state, finish]);

  if (gone || !state) return null;
  const src =
    state === "720"
      ? config.str("intro.video_url_720", DEFAULT_INTRO_720)
      : config.str("intro.video_url_1080", DEFAULT_INTRO_1080);
  return (
    <div
      data-testid="intro-splash"
      aria-hidden
      className={cn(
        "fixed inset-0 z-[310] grid cursor-pointer place-items-center bg-black transition-opacity ease-out",
        leaving ? "opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      {!logoOnly && state !== "logo" ? (
        <video
          ref={video}
          src={src}
          muted
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          onEnded={finish}
          className="h-full w-full object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={config.str("branding.logo_url", BRAND.logo)}
          alt=""
          className="w-[min(60vw,420px)] animate-[page-in_400ms_ease-out_both]"
        />
      )}
    </div>
  );
}
