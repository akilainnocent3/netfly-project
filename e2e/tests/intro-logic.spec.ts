/** Unit tests (no browser) for the intro frequency rules shared by the splash and the pre-roll. */
import { expect, test } from "@playwright/test";
import {
  introBoot,
  introBootScript,
  pickIntroVariant,
  prerollDue,
  markPreroll,
  type IntroBootConfig,
  type IntroBootEnv,
} from "../../apps/client/src/lib/intro";

function store(): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const CFG: IntroBootConfig = {
  enabled: true,
  onAppOpen: true,
  frequency: "once_per_session",
  url1080: "/brand/a-1080.mp4",
  url720: "/brand/a-720.mp4",
};

function env(over: Partial<IntroBootEnv> = {}): IntroBootEnv {
  return {
    userAgent: "Mozilla/5.0 Chrome/141",
    width: 1440,
    saveData: false,
    reducedMotion: false,
    now: new Date(2026, 9, 21, 10),
    session: store(),
    local: store(),
    ...over,
  };
}

test("once per session: plays on the first load only", () => {
  const e = env();
  expect(introBoot(CFG, e)).toBe("1080");
  expect(introBoot(CFG, e)).toBe("");
  // A new tab is a new session.
  expect(introBoot(CFG, { ...e, session: store() })).toBe("1080");
});

test("once per day: survives sessions, comes back the next day", () => {
  const cfg = { ...CFG, frequency: "once_per_day" as const };
  const local = store();
  expect(introBoot(cfg, env({ local }))).toBe("1080");
  expect(introBoot(cfg, env({ local }))).toBe("");
  expect(introBoot(cfg, env({ local, now: new Date(2026, 9, 22, 0, 1) }))).toBe("1080");
});

test("every visit: plays on every page load", () => {
  const cfg = { ...CFG, frequency: "every_visit" as const };
  const e = env();
  expect(introBoot(cfg, e)).toBe("1080");
  expect(introBoot(cfg, e)).toBe("1080");
});

test("variant: 720p below 900px or on Save-Data; logo only with reduced motion", () => {
  expect(introBoot(CFG, env({ width: 390 }))).toBe("720");
  expect(introBoot(CFG, env({ saveData: true }))).toBe("720");
  expect(introBoot(CFG, env({ reducedMotion: true }))).toBe("logo");
  expect(pickIntroVariant(899, false)).toBe("720");
  expect(pickIntroVariant(900, false)).toBe("1080");
});

test("never for bots, never when disabled; the preload matches the variant", () => {
  expect(introBoot(CFG, env({ userAgent: "Googlebot/2.1" }))).toBe("");
  expect(introBoot(CFG, env({ userAgent: "Chrome-Lighthouse" }))).toBe("");
  expect(introBoot({ ...CFG, enabled: false }, env())).toBe("");
  expect(introBoot({ ...CFG, onAppOpen: false }, env())).toBe("");
  const applied: Array<[string, string]> = [];
  introBoot(CFG, env({ width: 390, apply: (s, href) => void applied.push([s, href]) }));
  expect(applied).toEqual([["720", "/brand/a-720.mp4"]]);
});

test("storage that throws doesn't break the app (the splash just plays)", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  expect(introBoot(CFG, env({ session: broken }))).toBe("1080");
});

test("the inline boot script is self-contained and escapes the config", () => {
  const src = introBootScript({ ...CFG, url1080: "/x</script><script>alert(1)//" });
  expect(src).not.toContain("</script>");
  expect(() => new Function(src)).not.toThrow();
});

test("pre-roll: always / once per title per session / off; autoplay-next follows its flag", () => {
  const session = store();
  const ctx = { slug: "the-heist", autoplayed: false, onAutoplayNext: false, session };
  expect(prerollDue(true, "always", ctx)).toBe(true);
  expect(prerollDue(true, "off", ctx)).toBe(false);
  expect(prerollDue(false, "always", ctx)).toBe(false);
  expect(prerollDue(true, "once_per_title_per_session", ctx)).toBe(true);
  markPreroll(ctx);
  expect(prerollDue(true, "once_per_title_per_session", ctx)).toBe(false);
  expect(prerollDue(true, "once_per_title_per_session", { ...ctx, slug: "other" })).toBe(true);
  expect(prerollDue(true, "always", ctx)).toBe(true);
  expect(prerollDue(true, "always", { ...ctx, autoplayed: true })).toBe(false);
  expect(prerollDue(true, "always", { ...ctx, autoplayed: true, onAutoplayNext: true })).toBe(true);
});
