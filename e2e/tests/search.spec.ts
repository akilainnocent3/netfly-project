import { expect, signUp, test } from "./helpers";

test("desktop: the icon opens a square white box; typing replaces the URL; clearing goes back", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/browse");
  const before = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "Search" }).click();
  const box = page.getByTestId("search-box");
  await expect(box).toBeVisible();
  await expect(box).toHaveCSS("border-radius", "0px");
  await expect(box).toHaveCSS("border-top-color", "rgb(255, 255, 255)");
  await expect(box).toHaveCSS("background-color", /^(rgba\(0, 0, 0, 0\.75\)|oklab\(0 0 0 \/ 0\.75\))$/);
  const input = page.getByRole("searchbox", { name: "Search" });
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("placeholder", "Titles, people, genres");

  await input.pressSequentially("kingd", { delay: 40 });
  await page.waitForURL(/\/search\?q=kingd/);
  await input.pressSequentially("om", { delay: 40 });
  await page.waitForURL(/\/search\?q=kingdom/);
  // One history entry for the whole search, however many keystrokes.
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  const results = page.getByTestId("search-results");
  await expect(results.getByRole("link", { name: /Kingdom of Ash/ }).first()).toBeVisible();
  await expect(page.getByText("Explore titles related to:")).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/search-desktop.png" });

  // A related term searches for it.
  const term = page.locator("p", { hasText: "Explore titles related to:" }).getByRole("button").first();
  const label = (await term.innerText()).trim();
  await term.click();
  await expect(input).toHaveValue(label);
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(label).replace(/%20/g, "(\\+|%20)")}`));

  // Clearing returns to where the search started.
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.waitForURL(/\/browse/);
});

test("desktop: no matches, Esc closes, a click outside an empty box closes it", async ({ page }) => {
  await signUp(page);
  await page.goto("/browse");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("searchbox", { name: "Search" }).pressSequentially("zzqxv", { delay: 30 });
  const none = page.getByTestId("no-matches");
  await expect(none).toContainText('Your search for "zzqxv" did not have any matches.');
  for (const tip of [
    "Try different keywords",
    "Looking for a movie or series?",
    "Try using a movie, series title, an actor or director",
    "Try a genre, like comedy, romance, sports, or drama",
  ])
    await expect(none.getByText(tip)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForURL(/\/browse/);
  await expect(page.getByTestId("search-box")).toHaveCount(0);

  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("search-box")).toBeVisible();
  await page.mouse.click(600, 500);
  await expect(page.getByTestId("search-box")).toHaveCount(0);
});

test("signed-out visitors can search too", async ({ page }) => {
  await page.goto("/search?q=neon");
  await expect(page.getByTestId("search-results").getByRole("link", { name: /Neon Tide/ }).first()).toBeVisible();
});
