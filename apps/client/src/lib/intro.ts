/**
 * Brand intro rules — one source for the app-open splash and the playback pre-roll.
 *
 * The splash decision runs in an inline <head> script before first paint (so the
 * page never flashes before the splash covers it). That script is generated from
 * `introBoot` with Function#toString, so `introBoot` must stay self-contained:
 * no imports and no references to module-level values.
 */

export const DEFAULT_INTRO_1080 = "/brand/netfly-intro-1080p.v1.mp4";
export const DEFAULT_INTRO_720 = "/brand/netfly-intro-720p.v1.mp4";
export const APP_INTRO_KEY = "netfly-intro-app";
export const TITLE_INTRO_PREFIX = "netfly-intro-title:";

export type AppOpenFrequency = "once_per_session" | "once_per_day" | "every_visit";
export type BeforePlayback = "always" | "once_per_title_per_session" | "off";

export interface IntroBootConfig {
  enabled: boolean;
  onAppOpen: boolean;
  frequency: AppOpenFrequency;
  url1080: string;
  url720: string;
}

/** What the boot script decided, stored on <html data-intro>. */
export type AppIntroState = "1080" | "720" | "logo" | "";

export interface IntroBootEnv {
  userAgent: string;
  width: number;
  saveData: boolean;
  reducedMotion: boolean;
  now: Date;
  session: Pick<Storage, "getItem" | "setItem"> | null;
  local: Pick<Storage, "getItem" | "setItem"> | null;
  /** Sets <html data-intro> and adds the preload link (omitted in tests). */
  apply?: (state: AppIntroState, href: string) => void;
}

/**
 * Decide whether the app-open splash plays on this page load, mark it as seen,
 * and return the variant. Self-contained: serialised into the inline boot script.
 */
export function introBoot(cfg: IntroBootConfig, env?: IntroBootEnv): AppIntroState {
  const safe = (get: () => Storage) => {
    try {
      return get();
    } catch {
      return null;
    }
  };
  const nav =
    typeof navigator === "undefined"
      ? null
      : (navigator as Navigator & { connection?: { saveData?: boolean } });
  const e: IntroBootEnv = env ?? {
    userAgent: nav?.userAgent ?? "",
    width: window.innerWidth,
    saveData: !!nav?.connection?.saveData,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    now: new Date(),
    session: safe(() => window.sessionStorage),
    local: safe(() => window.localStorage),
    apply: (state, href) => {
      document.documentElement.setAttribute("data-intro", state);
      if (!href) return;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "video";
      link.href = href;
      link.type = "video/mp4";
      document.head.appendChild(link);
    },
  };
  if (!cfg.enabled || !cfg.onAppOpen) return "";
  // Crawlers and audit bots never see it (it would only hide the content they index).
  if (/bot|crawl|spider|slurp|facebookexternalhit|lighthouse|pagespeed/i.test(e.userAgent))
    return "";
  const key = "netfly-intro-app";
  const day = `${e.now.getFullYear()}-${e.now.getMonth() + 1}-${e.now.getDate()}`;
  const read = (s: IntroBootEnv["session"]) => {
    try {
      return s ? s.getItem(key) : null;
    } catch {
      return null;
    }
  };
  const write = (s: IntroBootEnv["session"], v: string) => {
    try {
      s?.setItem(key, v);
    } catch {
      /* storage blocked: the splash simply plays again next time */
    }
  };
  if (cfg.frequency === "once_per_session") {
    if (read(e.session) === "1") return "";
    write(e.session, "1");
  } else if (cfg.frequency === "once_per_day") {
    if (read(e.local) === day) return "";
    write(e.local, day);
  }
  const state: AppIntroState = e.reducedMotion
    ? "logo"
    : e.width < 900 || e.saveData
      ? "720"
      : "1080";
  e.apply?.(state, state === "720" ? cfg.url720 : state === "1080" ? cfg.url1080 : "");
  return state;
}

/** Inline script source for the root layout (`introBoot` + its config, JSON-escaped). */
export function introBootScript(cfg: IntroBootConfig): string {
  const json = JSON.stringify(cfg).replace(/</g, "\\u003c");
  return `try{(${introBoot.toString()})(${json})}catch(_){}`;
}

export interface PrerollContext {
  slug: string;
  autoplayed: boolean;
  onAutoplayNext: boolean;
  session: Pick<Storage, "getItem" | "setItem"> | null;
}

/** Should the intro play before this playback? (Muted previews never ask.) */
export function prerollDue(enabled: boolean, mode: BeforePlayback, ctx: PrerollContext): boolean {
  if (!enabled || mode === "off") return false;
  if (ctx.autoplayed && !ctx.onAutoplayNext) return false;
  if (mode === "once_per_title_per_session") {
    try {
      return ctx.session?.getItem(TITLE_INTRO_PREFIX + ctx.slug) !== "1";
    } catch {
      return true;
    }
  }
  return true;
}

export function markPreroll(ctx: Pick<PrerollContext, "slug" | "session">): void {
  try {
    ctx.session?.setItem(TITLE_INTRO_PREFIX + ctx.slug, "1");
  } catch {
    /* ignore */
  }
}

export function pickIntroVariant(width: number, saveData: boolean): "720" | "1080" {
  return width < 900 || saveData ? "720" : "1080";
}
