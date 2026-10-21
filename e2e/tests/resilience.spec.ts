import { expect, test } from "@playwright/test";
import { homeRows, signUp } from "./helpers";

test("an offline banner appears and clears when the connection returns", async ({ page, context }) => {
  await signUp(page);
  await homeRows(page);
  await context.setOffline(true);
  await expect(page.getByRole("status").getByText(/You're offline/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("status").getByText("Back online")).toBeVisible();
  await expect(page.getByRole("status").getByText("Back online")).toBeHidden({ timeout: 6_000 });
});

test("unknown pages show a branded 404 with a way home", async ({ page }) => {
  const res = await page.goto("/legal/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Lost your way?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
});
