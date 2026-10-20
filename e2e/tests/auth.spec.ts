import { expect, test } from "@playwright/test";
import { PASSWORD, signUp, uniqueName } from "./helpers";

test("sign up auto-submits without pressing a button", async ({ page }) => {
  await signUp(page); // only types — never clicks submit or presses Enter
  await expect(page.getByRole("radiogroup", { name: "Translation filter" })).toBeVisible();
});

test("taken usernames are flagged live", async ({ page }) => {
  const name = await signUp(page);
  await page.context().clearCookies();
  await page.goto("/signup");
  await page.locator("input[name=username]").pressSequentially(name.toUpperCase(), { delay: 10 });
  await expect(page.getByText("That username is taken.")).toBeVisible();
});

test("log in auto-submits and wrong passwords explain themselves", async ({ page }) => {
  const name = await signUp(page, uniqueName("login"));
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("input[name=username]").fill(name);
  await page.locator("input[name=password]").pressSequentially("not-the-password", { delay: 10 });
  await expect(page.getByText("Wrong username or password.")).toBeVisible();
  await page.locator("input[name=password]").fill("");
  await page.locator("input[name=password]").pressSequentially(PASSWORD, { delay: 10 });
  await page.waitForURL("**/browse**");
});
