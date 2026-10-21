import { expect, signUp, test } from "./helpers";

test("phone layout: tab bar and compact switcher", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("navigation", { name: "Primary" }).last()).toBeVisible();
  await expect(page.getByRole("radio", { name: "Original" })).toBeVisible();
  await page.getByRole("link", { name: "Categories" }).last().click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
});

test("phone search: Top Searches list, then a 3-column poster grid while typing", async ({ page }) => {
  await signUp(page);
  await page.goto("/search");
  const input = page.getByRole("searchbox", { name: "Search" });
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("placeholder", "Search shows, movies…");
  const top = page.getByTestId("top-searches");
  await expect(top.getByRole("listitem").first()).toBeVisible();
  await expect(top.getByRole("link", { name: /^Play / }).first()).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/search-mobile-top.png" });

  await input.fill("neon");
  await expect(page.getByRole("heading", { name: "Movies & Series" })).toBeVisible();
  await expect(page).toHaveURL(/\/search\?(.*&)?q=neon/);
  const grid = page.getByTestId("search-results").getByRole("list").first();
  await expect(grid).toHaveCSS("grid-template-columns", /^\S+ \S+ \S+$/);
  await page.screenshot({ path: "../docs/screenshots/search-mobile.png" });

  // Tapping a Top Search opens the title.
  await input.fill("");
  await top.getByRole("listitem").first().getByRole("link").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
