import { canPlayH264, expect, playableSlug, signUp, test } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signUp(page);
  test.skip(!(await canPlayH264(page)), "This browser has no H.264/AAC (bundled Chromium): run with NETFLY_E2E_CHANNEL=chrome.");
});

test("plays a movie at high quality, then resumes where it stopped", async ({ page }) => {
  const slug = await playableSlug(page, "movie");
  test.skip(!slug, "No transcoded movie yet (configure S3 and run seed_demo).");
  await page.goto(`/watch/${slug}`);
  const video = page.locator("video:not([aria-hidden=true])");
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(3);
  expect(await video.evaluate((v: HTMLVideoElement) => v.videoHeight)).toBeGreaterThanOrEqual(720);
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 20;
  });
  await page.waitForTimeout(1500);
  await page.keyboard.press("k"); // pause → saves progress
  await page.waitForTimeout(1000);
  await page.goto(`/title/${slug}`);
  await expect(page.getByRole("link", { name: /Resume/ })).toBeVisible();
  await page.getByRole("link", { name: /Resume/ }).click();
  await expect.poll(async () => page.locator("video:not([aria-hidden=true])").evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(15);
});

test("binges a series: Skip Intro, then the Next Episode countdown", async ({ page }) => {
  const slug = await playableSlug(page, "series");
  test.skip(!slug, "No transcoded series yet (configure S3 and run seed_demo).");
  await page.goto(`/watch/${slug}`);
  const video = page.locator("video:not([aria-hidden=true])");
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(3.2);
  await page.getByRole("button", { name: /Skip Intro/ }).click();
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(10);
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = v.duration - 6;
  });
  await expect(page.getByText(/Next episode in \d+s/)).toBeVisible();
  await page.waitForURL(/episode=\d+.*autoplay=1/, { timeout: 30_000 });
});

test("hero trailer autoplays muted, pauses when scrolled out of view and resumes", async ({ page }) => {
  await page.goto("/browse");
  const trailer = page.locator("section[aria-label='Featured'] video").first();
  const state = () =>
    trailer.evaluate((v: HTMLVideoElement) => ({ playing: !v.paused && v.currentTime > 0.3, muted: v.muted }));
  await expect.poll(state, { timeout: 30_000 }).toEqual({ playing: true, muted: true });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => trailer.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => trailer.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
});
