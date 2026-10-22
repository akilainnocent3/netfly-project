/**
 * Unit tests for the brand loader: the presence timeline (fake clock, no browser) and the
 * CSS-only delay / reduced-motion behaviour of the real <LogoLoader> markup and stylesheet
 * (animations are paused and seeked, so nothing depends on wall-clock timing).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createElement, Fragment, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoaderTimeline, type LoaderPhase, type Scheduler } from "../../packages/ui/src/loader-timeline";
import { LogoLoader, type LogoLoaderProps } from "../../packages/ui/src/logo-mark";

const CSS = readFileSync(path.join(__dirname, "../../packages/ui/src/logo-loader.css"), "utf8");
// The apps' global reduced-motion reset (globals.css): the loader must still pulse under it.
const APP_RESET = `@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}`;

class FakeClock implements Scheduler {
  time = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private next = 1;
  now = () => this.time;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.timers.set(id, { at: this.time + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown) => void this.timers.delete(id as number);
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
    }
    this.time = end;
  }
}

function timeline() {
  const clock = new FakeClock();
  const phases: Array<[number, LoaderPhase]> = [];
  const t = new LoaderTimeline((p) => phases.push([clock.time, p]), { delay: 200, minDuration: 400, exit: 150 }, clock);
  return { t, clock, phases };
}

test.describe("loader timeline", () => {
  test("fast work shows nothing", () => {
    const { t, clock, phases } = timeline();
    t.set(true);
    clock.advance(150);
    t.set(false);
    clock.advance(2000);
    expect(phases).toEqual([]);
  });

  test("slow work shows after the delay and stays at least minDuration", () => {
    const { t, clock, phases } = timeline();
    t.set(true);
    clock.advance(250); // visible at 200
    t.set(false); // done 50 ms after appearing: held until 200 + 400
    clock.advance(2000);
    expect(phases).toEqual([
      [200, "visible"],
      [600, "exiting"],
      [750, "hidden"],
    ]);
  });

  test("long work exits right after it finishes", () => {
    const { t, clock, phases } = timeline();
    t.set(true);
    clock.advance(1500);
    t.set(false);
    clock.advance(1000);
    expect(phases).toEqual([
      [200, "visible"],
      [1500, "exiting"],
      [1650, "hidden"],
    ]);
  });

  test("work that resumes during the exit fade keeps the loader (no blink)", () => {
    const { t, clock, phases } = timeline();
    t.set(true);
    clock.advance(1000);
    t.set(false);
    clock.advance(50); // exiting at 1000
    t.set(true);
    clock.advance(1000);
    expect(phases).toEqual([
      [200, "visible"],
      [1000, "exiting"],
      [1050, "visible"],
    ]);
  });
});

/*
 * Playwright compiles .tsx imported by a spec with its own JSX runtime (for component testing),
 * so components return `{__pw_type: "jsx", …}` descriptors instead of React elements. Convert
 * them back, wrapping each function component so its output is converted when React renders it.
 */
type PwNode = { __pw_type: "jsx"; type: unknown; props: Record<string, unknown>; key?: string };
const wrapped = new Map<unknown, FunctionComponent<Record<string, unknown>>>();
function component(type: unknown): unknown {
  if (type && typeof type === "object" && "__pw_jsx_fragment" in type) return Fragment;
  if (typeof type !== "function") return type;
  if (!wrapped.has(type)) {
    wrapped.set(type, (props) => toReact((type as (p: unknown) => unknown)(props)) as ReactNode);
  }
  return wrapped.get(type);
}
function toReact(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toReact);
  if (node && typeof node === "object" && (node as PwNode).__pw_type === "jsx") {
    const { type, props, key } = node as PwNode;
    const { children, ...rest } = props ?? {};
    const kids = children === undefined ? [] : [toReact(children)];
    return createElement(component(type) as string, { ...rest, key }, ...(kids as ReactNode[]));
  }
  return node;
}

async function mount(page: Page, props: LogoLoaderProps[] = [{}]) {
  const Loader = component(LogoLoader) as FunctionComponent<LogoLoaderProps>;
  // One React root, like a page, so useId gives each instance its own ids.
  const html = renderToStaticMarkup(createElement(Fragment, null, ...props.map((p, i) => createElement(Loader, { ...p, key: i }))));
  await page.setContent(`<!doctype html><html><head><style>${CSS}\n${APP_RESET}</style></head><body style="background:#141414">${html}</body></html>`);
}

/** Pause every animation of the first loader and seek it to `ms` after mount. */
async function opacityAt(page: Page, ms: number): Promise<number> {
  return page.evaluate((t) => {
    const el = document.querySelector(".nf-loader")!;
    for (const a of el.getAnimations({ subtree: true })) {
      a.pause();
      a.currentTime = t;
    }
    return Number(getComputedStyle(el).opacity);
  }, ms);
}

test.describe("LogoLoader (CSS)", () => {
  test("appears only after its delay (fade in over 200 ms)", async ({ page }) => {
    await mount(page, [{ delay: 200 }]);
    expect(await opacityAt(page, 0)).toBe(0);
    expect(await opacityAt(page, 190)).toBe(0);
    expect(await opacityAt(page, 300)).toBeGreaterThan(0);
    expect(await opacityAt(page, 300)).toBeLessThan(1);
    expect(await opacityAt(page, 450)).toBe(1);
  });

  test("a custom delay is honoured", async ({ page }) => {
    await mount(page, [{ delay: 800 }]);
    expect(await opacityAt(page, 700)).toBe(0);
    expect(await opacityAt(page, 1100)).toBe(1);
  });

  test("exiting fades out over 150 ms", async ({ page }) => {
    await mount(page, [{ exiting: true }]);
    expect(await opacityAt(page, 0)).toBe(1);
    expect(await opacityAt(page, 160)).toBe(0);
  });

  test("is a polite status with a hidden label; decorative instances are hidden", async ({ page }) => {
    await mount(page, [{}, { decorative: true }, { label: "Buffering", size: "lg", showLabel: true }]);
    const [plain, decorative, labelled] = await page.locator(".nf-loader").all();
    await expect(plain!).toHaveAttribute("role", "status");
    await expect(plain!).toHaveAttribute("aria-live", "polite");
    await expect(plain!).toHaveText("Loading…");
    await expect(decorative!).toHaveAttribute("aria-hidden", "true");
    await expect(decorative!).not.toHaveAttribute("role", /.*/);
    await expect(labelled!.locator(".nf-loader__label")).toHaveText("Buffering");
    // Gradient / mask ids are unique per instance.
    const ids = await page.locator("[id]").evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("sizes: sm 20 px, md 48 px, lg 96 px", async ({ page }) => {
    await mount(page, [{ size: "sm" }, { size: "md" }, { size: "lg" }]);
    const widths = await page.locator(".nf-loader__art").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(widths).toEqual([20, 48, 96]);
  });

  test("reduced motion: no travelling light or scaling, only a slow opacity pulse", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mount(page, [{ delay: 200, size: "lg" }]);
    const state = await page.evaluate(() => {
      const root = document.querySelector(".nf-loader")!;
      const svg = root.querySelector("svg")!;
      const s = getComputedStyle(svg);
      return {
        light: getComputedStyle(root.querySelector(".nf-loader__light")!).display,
        deepen: getComputedStyle(root.querySelector(".nf-loader__deepen")!).display,
        name: s.animationName,
        duration: s.animationDuration,
        iterations: s.animationIterationCount,
        direction: s.animationDirection,
      };
    });
    expect(state).toEqual({
      light: "none",
      deepen: "none",
      name: "nf-pulse",
      duration: "1s",
      iterations: "infinite",
      direction: "alternate",
    });
    // Still waits for its delay before appearing.
    expect(await opacityAt(page, 100)).toBe(0);
    // The pulse runs between 1 and 0.6 (alternate, 1 s each way = 2 s per cycle).
    const pulse = await page.evaluate(() => {
      const svg = document.querySelector(".nf-loader svg")!;
      const a = svg.getAnimations()[0]!;
      a.pause();
      a.currentTime = 200 + 1000;
      const low = Number(getComputedStyle(svg).opacity);
      a.currentTime = 200 + 2000;
      return { low, high: Number(getComputedStyle(svg).opacity), transform: getComputedStyle(svg).transform };
    });
    expect(pulse.low).toBeCloseTo(0.6, 2);
    expect(pulse.high).toBeCloseTo(1, 2);
    expect(pulse.transform).toBe("none");
  });
});
