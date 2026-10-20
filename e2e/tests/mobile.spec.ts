import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("phone layout: tab bar and compact switcher", async ({ page }) => {
  await signUp(page);
  await expect(page.getByRole("navigation", { name: "Primary" }).last()).toBeVisible();
  await expect(page.getByRole("radio", { name: "Original" })).toBeVisible();
  await page.getByRole("link", { name: "Categories" }).last().click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
});
