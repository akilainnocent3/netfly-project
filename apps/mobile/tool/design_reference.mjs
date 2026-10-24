// Screenshots of the web viewer app at phone width: the specification the Flutter app matches
// (apps/mobile/design-reference/<device>/<screen>.png). Needs the stack with the demo catalog.
//
//   cd e2e && node ../apps/mobile/tool/design_reference.mjs
//
// NETFLY_CLIENT_URL (default http://localhost:3000) points at the viewer app.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Playwright comes from the e2e workspace (the mobile app has no Node dependencies).
const require = createRequire(join(process.cwd(), "package.json"));
const { chromium, devices } = require("@playwright/test");

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "design-reference");
const BASE = process.env.NETFLY_CLIENT_URL ?? "http://localhost:3000";
const PASSWORD = "stream-all-night-42";

const DEVICES = {
  "iphone13-390x844": devices["iPhone 13"],
  "pixel7-412x915": devices["Pixel 7"],
};

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** A titled slug for the title / category / player screens. */
async function sampleSlugs() {
  const genres = await api("/api/v1/genres?translation=all");
  for (const mode of ["translated", "not_translated"]) {
    const billboard = await api(`/api/v1/browse/billboard?translation=${mode}`);
    const series = billboard.find((b) => b.title.type === "series") ?? billboard[0];
    if (series) return { title: series.title.slug, genre: genres[0]?.slug ?? "comedy", mode };
  }
  throw new Error("no titles: seed the demo catalog first");
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Let images decode and entrance animations finish.
  await page.waitForTimeout(1200);
}

async function shoot(page, dir, name, { fullPage = false } = {}) {
  await settle(page);
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage });
  console.log(`  ${name}`);
}

const signedOut = [
  ["01-landing", "/"],
  ["02-sign-in", "/login"],
  ["03-sign-up-name", "/signup/name"],
  ["04-categories-signed-out", "/categories"],
];

async function run() {
  const { title, genre, mode } = await sampleSlugs();
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  try {
    for (const [name, device] of Object.entries(DEVICES)) {
      // A fresh member per device, so every shot starts from the same defaults.
      const username = `designref_${Date.now().toString(36)}`.slice(0, 30);
      await api("/api/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ username, full_name: "Design Reference", password: PASSWORD, app: "client" }),
      });
      const dir = join(OUT, name);
      mkdirSync(dir, { recursive: true });
      console.log(name);
      const context = await browser.newContext({ ...device, baseURL: BASE, reducedMotion: "reduce" });
      // The app-open splash is its own screen; skip it for the others.
      await context.addInitScript(() => sessionStorage.setItem("netfly-intro-app", "1"));
      const page = await context.newPage();
      for (const [shot, path] of signedOut) {
        await page.goto(path);
        await shoot(page, dir, shot);
      }

      await page.goto("/login");
      await page.locator("input[name=username]").fill(username);
      await page.locator("input[name=password]").fill(PASSWORD);
      await page.getByRole("button", { name: /^Sign in$/i }).click();
      await page.waitForURL(/\/(browse|signup\/plan)/);
      if (page.url().includes("/signup/plan")) {
        await page.getByRole("button", { name: /start watching/i }).click();
        await page.waitForURL(/\/browse/);
      }
      await page.goto(`/browse?translation=${mode}`);
      await shoot(page, dir, "10-home");
      await page.mouse.wheel(0, 700);
      await shoot(page, dir, "11-home-rows");
      await page.goto(`/series?translation=${mode}`);
      await shoot(page, dir, "12-series");
      await page.goto(`/title/${title}?translation=${mode}`);
      await shoot(page, dir, "20-title");
      await page.mouse.wheel(0, 900);
      await shoot(page, dir, "21-title-episodes");
      await page.goto(`/new-and-popular?translation=${mode}`);
      await shoot(page, dir, "30-new-and-hot");
      await page.goto("/search");
      await shoot(page, dir, "40-search-empty");
      await page.goto("/search?q=the");
      await shoot(page, dir, "41-search-results");
      await page.goto("/my-list");
      await shoot(page, dir, "50-my-list-empty");
      await page.goto("/categories");
      await shoot(page, dir, "60-categories");
      await page.goto(`/categories/${genre}`);
      await shoot(page, dir, "61-category");
      await page.goto("/account");
      await shoot(page, dir, "70-account");
      await page.goto("/account/membership");
      await shoot(page, dir, "71-membership");
      await page.goto("/account/playback");
      await shoot(page, dir, "72-playback");
      // The data warning when an autoplay switch is turned on (it starts on: off, then on).
      const previews = page.getByRole("switch", { name: /autoplay previews/i });
      await previews.click();
      await page.waitForTimeout(800);
      await previews.click();
      await shoot(page, dir, "73-playback-warning");
      await page.keyboard.press("Escape");
      await page.goto(`/watch/${title}`);
      await page.waitForTimeout(4000);
      await shoot(page, dir, "80-player");
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

await run();
