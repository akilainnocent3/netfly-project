import {
  canPlayH264,
  completeSignupSteps,
  countRequests,
  createAccount,
  expect,
  latestPayment,
  outboxCode,
  PASSWORD,
  snippeWebhook,
  stubWebOtp,
  test,
  uniqueName,
  uniquePhone,
} from "./helpers";

// Whole journeys from the brief, end to end (providers simulated for the run: see global-setup).
test.describe.configure({ mode: "serial" });

/** Signed out: Play on the hero opens the gate → Create account. */
async function playFromHeroSignedOut(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/browse");
  const hero = page.locator("section[aria-label='Featured']");
  await hero.getByRole("link", { name: "Play" }).first().click();
  const gate = page.getByTestId("auth-gate");
  await expect(gate).toContainText("Ready to watch?");
  await gate.getByRole("link", { name: "Create account" }).click();
}

test("anonymous → Play → gate → signup (3 steps) → Free → straight into the player, intro first", async ({
  page,
}) => {
  await playFromHeroSignedOut(page);
  await completeSignupSteps(page, uniqueName("journey")); // keeps the preselected Free plan
  await page.waitForURL(/\/watch\/[a-z0-9-]+/);
  if (await canPlayH264(page)) await expect(page.getByTestId("intro-preroll")).toBeVisible();
});

test("anonymous → Play → signup → paid plan → email code → phone OTP (auto-filled) → pay → webhook → success → the player", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await stubWebOtp(page);
  await playFromHeroSignedOut(page);
  const username = uniqueName("paid");
  await completeSignupSteps(page, username, { plan: false });
  await page.waitForURL(/\/signup\/plan/);
  await page.getByRole("radio", { name: /Mwanzo/ }).click();
  await page.getByRole("button", { name: /Skip the trial/ }).click();

  await page.waitForURL(/\/verify\/email/);
  const email = `${username}@example.com`.toLowerCase();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByTestId("code-digit-0").focus();
  await page.keyboard.insertText(await outboxCode("email", email));

  await page.waitForURL(/\/verify\/phone/);
  const phone = uniquePhone();
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByTestId("sent-to")).toBeVisible();
  const code = await outboxCode("sms", phone);
  await page.evaluate((c) => (window as unknown as { __deliverOtp: (x: string) => void }).__deliverOtp(c), code);

  await page.waitForURL(/\/payment\?plan=mwanzo/);
  await page.getByRole("button", { name: "Pay TSh 1,500" }).click();
  await expect(page.getByTestId("approval")).toContainText("Check your phone");
  await snippeWebhook((await latestPayment(username)).reference, "payment.completed");
  await expect(page.getByTestId("checkout-success")).toContainText("You're all set", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Start watching" }).click();
  // What the visitor wanted at the start: the player.
  await page.waitForURL(/\/watch\/[a-z0-9-]+/);
});

test("double-clicking a submit sends exactly one request", async ({ page }) => {
  // Sign in
  const username = await createAccount();
  await page.goto("/login");
  await page.locator("input[name=username]").fill(username);
  await page.locator("input[name=password]").fill(PASSWORD);
  expect(
    await countRequests(page, /^POST \/api\/v1\/auth\/login$/, async () => {
      await page.getByRole("button", { name: /^Sign in$/i }).dblclick();
      await page.waitForURL("**/browse**");
    }),
  ).toBe(1);

  // Signup → Finish, then Start watching on the plan picker
  await page.context().clearCookies();
  await page.goto("/signup/name");
  await page.locator("input[name=name]").fill("Double Click");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("input[name=username]").pressSequentially(uniqueName("dbl"), { delay: 10 });
  await expect(page.getByText("Nice — it’s yours if you want it.")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("input[name=password]").fill(PASSWORD);
  expect(
    await countRequests(page, /^POST \/api\/v1\/auth\/signup$/, async () => {
      await page.getByRole("button", { name: "Finish" }).dblclick();
      await page.waitForURL(/\/signup\/plan/);
    }),
  ).toBe(1);
  await expect(page.getByRole("radio", { checked: true })).toContainText("Bure");
  expect(
    await countRequests(page, /^POST \/api\/v1\/billing\/plan$/, async () => {
      await page.getByRole("button", { name: "Start watching" }).dblclick();
      await page.waitForURL("**/browse**");
    }),
  ).toBe(1);

  // Send code
  await page.goto("/verify/email?from=account");
  await page.getByLabel("Email address").fill(`${uniqueName("dbl")}@example.com`);
  expect(
    await countRequests(page, /^POST \/api\/v1\/auth\/verify\/email\/start$/, async () => {
      await page.getByRole("button", { name: "Send code" }).dblclick();
      await expect(page.getByTestId("sent-to")).toBeVisible();
    }),
  ).toBe(1);
});
