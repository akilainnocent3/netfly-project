import { expect, test } from "@playwright/test";
import { canPlayH264, playableSlug, signUp, skipAppIntro } from "./helpers";

const introAttr = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-intro"));

test.describe("app-open splash", () => {
  test("plays on the first open of a session only, then gets out of the way", async ({ page }) => {
    await page.goto("/");
    const splash = page.getByTestId("intro-splash");
    await expect(splash).toBeVisible();
    await page.waitForTimeout(2000); // the logo is fully drawn ~2 s into the ident
    await page.screenshot({ path: "../docs/screenshots/intro-splash.png" });
    // It ends by itself (≤ 5 s) and the page underneath is already rendered.
    await expect(splash).toBeHidden({ timeout: 8000 });
    expect(await introAttr(page)).toBeNull();
    await expect(page.locator("main").first()).toBeVisible();
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    expect(await introAttr(page)).toBeNull();
    await expect(page.getByTestId("intro-splash")).toHaveCount(0);
  });

  test("a tap or key press skips it", async ({ page }) => {
    await page.goto("/");
    const splash = page.getByTestId("intro-splash");
    await expect(splash).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(splash).toBeHidden({ timeout: 1500 });
  });
});

test.describe("playback pre-roll", () => {
  test.beforeEach(async ({ page, context }) => {
    await skipAppIntro(context);
    await signUp(page);
    test.skip(
      !(await canPlayH264(page)),
      "This browser has no H.264/AAC (bundled Chromium): run with NETFLY_E2E_CHANNEL=chrome.",
    );
  });

  test("Play shows the intro first; Skip starts the buffered title at once", async ({ page }) => {
    const slug = await playableSlug(page, "movie");
    test.skip(!slug, "No transcoded movie yet (configure S3 and run seed_demo).");
    let progressSaves = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/playback\/(progress|heartbeat)/.test(r.url())) progressSaves += 1;
    });
    await page.goto(`/title/${slug}`);
    await page.getByRole("link", { name: /^(Play|Resume)/ }).first().click();
    const preroll = page.getByTestId("intro-preroll");
    await expect(preroll).toBeVisible();
    const content = page.locator("video:not([aria-hidden=true])");
    // The title is attached and loading underneath, but paused at its start position.
    await expect.poll(() => content.evaluate((v: HTMLVideoElement) => v.src.startsWith("blob:") || !!v.src)).toBe(true);
    expect(await content.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "../docs/screenshots/intro-preroll.png" });
    expect(await content.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(0.5);
    expect(progressSaves).toBe(0); // intro time is never progress / usage
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(preroll).toBeHidden();
    await expect
      .poll(() => content.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.5), { timeout: 15_000 })
      .toBe(true);
  });

  test("without Skip the intro ends by itself and the title follows", async ({ page }) => {
    const slug = await playableSlug(page, "movie");
    test.skip(!slug, "No transcoded movie yet.");
    await page.goto(`/watch/${slug}`);
    const preroll = page.getByTestId("intro-preroll");
    await expect(preroll).toBeVisible();
    await expect(preroll).toBeHidden({ timeout: 10_000 });
    const content = page.locator("video:not([aria-hidden=true])");
    await expect.poll(() => content.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(1);
  });

  test("an autoplayed next episode skips the intro by default", async ({ page }) => {
    const slug = await playableSlug(page, "series");
    test.skip(!slug, "No transcoded series yet.");
    await page.goto(`/watch/${slug}?autoplay=1`);
    const content = page.locator("video:not([aria-hidden=true])");
    await expect.poll(() => content.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(1);
    await expect(page.getByTestId("intro-preroll")).toHaveCount(0);
  });
});
