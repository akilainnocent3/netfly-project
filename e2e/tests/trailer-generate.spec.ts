/** Studio → Titles → Video → Trailer → "Generate from video", then the viewer app plays it. */
import type { Page } from "@playwright/test";
import { adminApi, canPlayH264, expect, setConfig, signUp, test } from "./helpers";

const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";

type AdminVideo = { id: string; status: string; duration: number };
type TitleDetail = {
  id: number;
  slug: string;
  type: string;
  status: string;
  video: AdminVideo | null;
  trailer: AdminVideo | null;
  trailer_id: string | null;
};

let restore: { id: number; trailer_id: string | null } | null = null;

test.afterAll(async () => {
  await setConfig("trailer.min_seconds", 5);
  if (restore) {
    await adminApi(`titles/${restore.id}`, {
      method: "PATCH",
      body: JSON.stringify({ trailer_id: restore.trailer_id }),
    });
  }
});

async function studioLogin(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Username").fill(process.env.NETFLY_ADMIN_USER ?? "admin");
  await page.getByLabel("Password").fill(process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** A published movie whose feature is ready (null when media isn't set up). */
async function movieWithReadyFeature(): Promise<TitleDetail | null> {
  const res = await adminApi("titles?type=movie&status=published&page_size=50");
  const list = (await res.json()) as { results: Array<{ id: number; video_status: string | null }> };
  for (const row of list.results.filter((r) => r.video_status === "ready")) {
    const title = (await (await adminApi(`titles/${row.id}`)).json()) as TitleDetail;
    if (title.video?.status === "ready" && title.video.duration >= 12) return title;
  }
  return null;
}

test("generates a trailer from a range of the feature and viewers get it", async ({ browser, page }) => {
  test.setTimeout(240_000);
  const movie = await movieWithReadyFeature();
  test.skip(!movie, "No movie with a ready feature (configure S3 and run seed_demo).");
  restore = { id: movie!.id, trailer_id: movie!.trailer_id };
  await setConfig("trailer.min_seconds", 2); // the 4 s range below sits under the 5 s default

  const studio = await browser.newPage();
  await studioLogin(studio);
  await studio.goto(`${ADMIN}/titles/${movie!.id}`);
  await studio.getByRole("tab", { name: "video" }).click();
  const modes = studio.getByRole("radiogroup", { name: "How to add the trailer" });
  await modes.getByRole("radio", { name: "Generate from video" }).click();
  await expect(modes.getByRole("radio", { name: "Generate from video" })).toHaveAttribute("aria-checked", "true");
  // A movie with a generated trailer opens on the result; start a fresh cut.
  const regenerate = studio.getByRole("button", { name: "Regenerate" });
  if (await regenerate.isVisible()) await regenerate.click();

  const start = studio.getByLabel("Start", { exact: true });
  const end = studio.getByLabel("End", { exact: true });

  // "Set to current time" after seeking (needs a browser that can play H.264).
  if (await canPlayH264(studio)) {
    const player = studio.locator("video").first();
    await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 30_000 }).toBeGreaterThan(0);
    await player.evaluate((v: HTMLVideoElement) => {
      v.currentTime = 6;
    });
    await expect.poll(() => player.evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(6);
    await studio.getByRole("button", { name: "Set to current time for start" }).click();
    await expect(start).toHaveValue("0:06");
  }

  await start.fill("0:05");
  await end.fill("0:09");
  await end.blur();
  await expect(start).toHaveValue("0:05");
  await expect(end).toHaveValue("0:09");
  await expect(studio.getByRole("status").filter({ hasText: "Trailer:" })).toHaveText(
    "Trailer: 0:05 → 0:09 · 0:04 long",
  );
  await expect(studio.getByRole("slider", { name: "Trailer start" })).toHaveAttribute(
    "aria-valuetext",
    "Start, 5 seconds",
  );

  const created = studio.waitForResponse(
    (r) => r.url().endsWith(`/titles/${movie!.id}/trailer/generate`) && r.request().method() === "POST",
  );
  await studio.getByRole("button", { name: "Generate trailer" }).click();
  const asset = (await (await created).json()) as AdminVideo;
  expect(asset.status).toBe("queued");
  await expect(studio.getByText(/New trailer · from Feature, 0:05–0:09/)).toBeFocused();

  // Cutting → Analysing → Encoding → Ready; the card then shows the result.
  await expect(studio.getByText("Generated from Feature · 0:05–0:09")).toBeVisible({ timeout: 180_000 });
  await expect(studio.getByRole("button", { name: "Regenerate" })).toBeVisible();
  const detail = (await (await adminApi(`titles/${movie!.id}`)).json()) as TitleDetail;
  expect(detail.trailer_id).toBe(asset.id);
  expect(detail.trailer!.duration).toBeGreaterThan(3.8);
  expect(detail.trailer!.duration).toBeLessThan(4.2);

  // The viewer app's preview (title page header, as in the hero and on hover) plays the new trailer.
  test.skip(!(await canPlayH264(studio)), "This browser has no H.264/AAC (bundled Chromium): run with NETFLY_E2E_CHANNEL=chrome.");
  await signUp(page);
  const master = page.waitForRequest((r) => r.url().includes(`/stream/${asset.id}/master.m3u8`), { timeout: 30_000 });
  await page.goto(`/title/${detail.slug}`);
  await master;
});
