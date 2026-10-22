import { chooseFreePlan, expect, PASSWORD, signUp, test, uniqueName } from "./helpers";

test("sign up never submits on its own; Finish does", async ({ page }) => {
  let posts = 0;
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/api/v1/auth/signup") && posts++);
  await page.goto("/signup");
  await page.locator("input[name=name]").fill("Idle Viewer");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("input[name=username]").pressSequentially(uniqueName("idle"), { delay: 10 });
  await expect(page.getByText("Nice — it’s yours if you want it.")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.waitForTimeout(2500); // the old auto-submit fired after ~0.6 s
  expect(posts).toBe(0);
  await expect(page).toHaveURL(/\/signup\/password/);
  await page.getByRole("button", { name: "Finish" }).click();
  await chooseFreePlan(page);
  await page.waitForURL("**/browse**");
  expect(posts).toBe(1);
  await expect(page.getByRole("radiogroup", { name: "Translation filter" })).toBeVisible();
});

test("taken usernames are flagged live", async ({ page }) => {
  const name = await signUp(page);
  await page.context().clearCookies();
  await page.goto("/signup/name");
  await page.locator("input[name=name]").fill("Someone Else");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("input[name=username]").pressSequentially(name.toUpperCase(), { delay: 10 });
  await expect(page.getByText("That username is taken.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
});

test("log in submits on Enter only and wrong passwords explain themselves", async ({ page }) => {
  const name = await signUp(page, uniqueName("login"));
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("input[name=username]").fill(name);
  await page.locator("input[name=password]").fill("not-the-password");
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/login/);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Wrong username or password.")).toBeVisible();
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/browse**");
});

test("password change never submits on its own and needs the new password twice", async ({ page }) => {
  await signUp(page);
  await page.goto("/account/security");
  let posts = 0;
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/api/v1/auth/me/password") && posts++);
  const form = page.getByTestId("password-form");
  await form.getByLabel("Current password").fill(PASSWORD);
  await form.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.waitForTimeout(2500);
  expect(posts).toBe(0);
  await form.getByLabel("Confirm new password").fill("a-different-password");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByText("The passwords don't match.")).toBeVisible();
  expect(posts).toBe(0);
  await form.getByLabel("Confirm new password").fill("a-brand-new-password");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed. Other devices were signed out.")).toBeVisible();
  expect(posts).toBe(1);
});

test("double-clicking My List sends exactly one request", async ({ page }) => {
  await signUp(page);
  await page.goto("/title/paper-kings?translation=translated");
  const requests: string[] = [];
  page.on("request", (r) => r.url().includes("/api/v1/my-list/") && requests.push(r.method()));
  const button = page.getByRole("dialog").getByRole("button", { name: "Add to My List" }).first();
  await button.dblclick();
  await expect(page.getByText(/Added Paper Kings to My List/)).toBeVisible();
  expect(requests).toEqual(["PUT"]);
});
