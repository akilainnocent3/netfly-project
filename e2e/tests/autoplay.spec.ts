import type { Page } from "@playwright/test";
import { expect, signUp, test } from "./helpers";

async function openPlayback(page: Page) {
  await page.goto("/account/playback");
  await expect(page.getByRole("heading", { name: "Playback" })).toBeVisible();
}

const previews = (page: Page) => page.getByRole("switch", { name: /Autoplay previews/ });
const nextEpisode = (page: Page) => page.getByRole("switch", { name: /Autoplay next episode/ });

test("turning autoplay on warns about mobile data; Cancel keeps it off, off needs no dialog", async ({
  page,
}) => {
  await signUp(page);
  await openPlayback(page);
  for (const toggle of [previews(page), nextEpisode(page)]) {
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    // Off: saved at once, no dialog.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // On: the data warning, with a figure from the bitrate ladder.
    await toggle.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Autoplay plays video automatically and uses mobile data");
    await expect(dialog).toContainText(/about \d+ MB per minute/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.click();
    await page.getByRole("dialog").getByRole("button", { name: "Turn on" }).click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }
  // It was saved to the account, not just the page.
  await page.reload();
  await expect(previews(page)).toHaveAttribute("aria-checked", "true");
});

test("with previews off, /browse never asks for a preview", async ({ page }) => {
  await signUp(page);
  await openPlayback(page);
  await previews(page).click();
  await expect(previews(page)).toHaveAttribute("aria-checked", "false");

  const asked: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (
      (url.pathname.startsWith("/api/v1/playback/") && url.searchParams.has("preview")) ||
      (url.pathname.endsWith("/master.m3u8") && url.searchParams.has("max_height"))
    )
      asked.push(url.pathname + url.search);
  });
  await page.goto("/browse");
  await page.waitForSelector("section[aria-labelledby^='row-']");
  // The billboard trailer, hover previews and focus prefetch all have their chance.
  const cards = page.locator("section[aria-labelledby^='row-'] a[href*='/title/']");
  const count = Math.min(await cards.count(), 6);
  for (let i = 0; i < count; i++) {
    await cards.nth(i).hover({ force: true }).catch(() => undefined);
    await cards.nth(i).focus().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2_000);
  expect(asked).toEqual([]);
});
