import { expect, test } from "@playwright/test";
import { homeRows, signUp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signUp(page);
});

test("switching Translated / Not Translated re-filters everything without a reload", async ({ page }) => {
  await homeRows(page);
  const hero = page.locator("section[aria-label='Featured'] h1").first();
  // The heading is either text or the title's logo art (whose alt is the title).
  const heroName = () =>
    hero.evaluate((el) => (el as HTMLElement).innerText.trim() || el.querySelector("img")?.alt || "");
  const before = await heroName();
  expect(before).not.toBe("");
  await page.evaluate(() => Object.assign(window, { __noReload: true }));
  await page.getByRole("radio", { name: "Not Translated" }).click();
  await expect(page).toHaveURL(/translation=not_translated/);
  await expect.poll(heroName).not.toBe(before);
  const statuses = await page.evaluate(async () => {
    const r = await fetch("/api/v1/browse/billboard?translation=not_translated");
    return ((await r.json()) as Array<{ title: { translation_status: string } }>).map((i) => i.title.translation_status);
  });
  expect(new Set(statuses)).toEqual(new Set(["not_translated"]));
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Not Translated" })).toHaveAttribute("aria-checked", "true");
});

test("liking a title adds a 'Because you liked' row", async ({ page }) => {
  const rows = await homeRows(page);
  expect(rows.some((r) => r.startsWith("Because you liked"))).toBe(false);
  await page.goto("/title/neon-tide?translation=translated");
  await page.getByRole("button", { name: "Rate this title" }).click();
  await page.getByRole("menuitemradio", { name: "I like this" }).click();
  await page.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByRole("heading", { name: "Because you liked Neon Tide" })).toBeVisible();
});

test("title modal deep-links and closes back to the feed", async ({ page }) => {
  await homeRows(page);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(800); // smooth scrolling settles
  const scroll = await page.evaluate(() => window.scrollY);
  await page.locator("[data-card] a").first().click();
  await expect(page).toHaveURL(/\/title\//);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.waitForTimeout(400);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scroll)).toBeLessThan(40);
});

test("search is typo tolerant", async ({ page }) => {
  await page.goto("/search?q=kingdm");
  await expect(page.getByRole("link", { name: /Kingdom of Ash/ }).first()).toBeVisible();
});

test("my list round-trip", async ({ page }) => {
  await page.goto("/title/paper-kings?translation=translated");
  await page.getByRole("dialog").getByRole("button", { name: "Add to My List" }).first().click();
  await page.goto("/my-list");
  await expect(page.getByRole("link", { name: /Paper Kings/ }).first()).toBeVisible();
});
