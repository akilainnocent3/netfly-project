import {
  createAccount,
  expect,
  PASSWORD,
  submitSignIn,
  test,
  uniqueName,
} from "./helpers";

test("one question per screen, each with its own URL; Back keeps what was typed", async ({ page }) => {
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/signup\/name$/);
  await expect(page.getByText(/Step\s*1\s*of\s*3/i)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "What's your name?" })).toBeVisible();
  // White registration layout with the light logo and a Sign In link.
  await expect(page.getByTestId("registration")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
  await page.locator("input[name=name]").fill("Neema Kileo");
  await page.screenshot({ path: "../docs/screenshots/signup-step-1-name.png" });
  await page.keyboard.press("Enter"); // Enter submits the step

  await expect(page).toHaveURL(/\/signup\/username$/);
  await expect(page.getByText(/Step\s*2\s*of\s*3/i)).toBeVisible();
  const username = uniqueName("steps");
  await page.locator("input[name=username]").pressSequentially(username, { delay: 10 });
  await expect(page.getByText("Nice — it’s yours if you want it.")).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/signup-step-2-username.png" });
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page).toHaveURL(/\/signup\/password$/);
  await page.locator("input[name=password]").fill("correct horse battery staple");
  await expect(page.getByText(/^(Strong|Very strong)$/)).toBeVisible();
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.locator("input[name=password]")).toHaveAttribute("type", "text");
  await page.screenshot({ path: "../docs/screenshots/signup-step-3-password.png" });

  // The browser's Back button walks the steps and keeps the values.
  await page.goBack();
  await expect(page).toHaveURL(/\/signup\/username$/);
  await expect(page.locator("input[name=username]")).toHaveValue(username);
  await page.goBack();
  await expect(page.locator("input[name=name]")).toHaveValue("Neema Kileo");
});

test("Next waits for a valid, available username", async ({ page }) => {
  const taken = await createAccount();
  await page.goto("/signup/name");
  await page.locator("input[name=name]").fill("Juma");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const field = page.locator("input[name=username]");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(next).toBeDisabled();
  await field.pressSequentially("bad name!", { delay: 10 });
  await expect(page.getByText("Use only letters, numbers and underscores.")).toBeVisible();
  await expect(next).toBeDisabled();
  await field.fill("");
  await field.pressSequentially(taken, { delay: 10 });
  await expect(page.getByText("That username is taken.")).toBeVisible();
  await expect(next).toBeDisabled();
  await field.fill("");
  await field.pressSequentially(uniqueName("free"), { delay: 10 });
  await expect(next).toBeEnabled();
});

test("a server error is mapped back to the step that owns the field", async ({ page }) => {
  const username = uniqueName("race");
  await page.goto("/signup/name");
  await page.locator("input[name=name]").fill("Racer");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("input[name=username]").pressSequentially(username, { delay: 10 });
  await expect(page.getByText("Nice — it’s yours if you want it.")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await createAccount(username); // someone else takes it in the meantime
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/signup\/username$/);
  await expect(page.getByText("That username is taken.")).toBeVisible();
});

test("the steps keep `next` and send the new member there", async ({ page }) => {
  await page.goto(`/signup?next=${encodeURIComponent("/new-and-popular")}`);
  await expect(page).toHaveURL(/\/signup\/name\?next=%2Fnew-and-popular/);
  await page.locator("input[name=name]").fill("Next Viewer");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/\/signup\/username\?next=%2Fnew-and-popular/);
  await page.locator("input[name=username]").pressSequentially(uniqueName("nx"), { delay: 10 });
  await expect(page.getByText("Nice — it’s yours if you want it.")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Finish" }).click();
  // Every new member picks a plan next; `next` rides along.
  await expect(page).toHaveURL(/\/signup\/plan\?next=%2Fnew-and-popular/);
  await page.getByRole("button", { name: "Start watching" }).click();
  await page.waitForURL(/\/new-and-popular/);
});

test("sign in: dark card, SHOW, and Remember me off keeps the session to this browser session", async ({ page, context }) => {
  const username = await createAccount();
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Sign In" })).toBeVisible();
  await page.locator("input[name=username]").fill(username);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.locator("input[name=password]")).toHaveAttribute("type", "text");
  await page.screenshot({ path: "../docs/screenshots/sign-in.png" });
  await page.getByText("Remember me").click();
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/browse/);
  const cookie = (await context.cookies()).find((c) => c.name === "netfly_rt_client");
  expect(cookie?.expires).toBe(-1); // session cookie
  await context.clearCookies();
  await page.goto("/login");
  await submitSignIn(page, username);
  await page.waitForURL(/\/browse/);
  const remembered = (await context.cookies()).find((c) => c.name === "netfly_rt_client");
  expect(remembered!.expires).toBeGreaterThan(Date.now() / 1000 + 86400);
});
