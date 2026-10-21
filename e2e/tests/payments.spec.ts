import type { Page } from "@playwright/test";
import {
  adminApi,
  expect,
  latestPayment,
  signUp,
  snippeWebhook,
  subscriberId,
  test,
  verifyContacts,
} from "./helpers";

// Mobile money is simulated for the run (global-setup): Snippe's side is played by signed webhooks
// sent to the real public endpoint, exactly as Snippe would send them.
test.describe.configure({ mode: "serial" });

async function verifiedMember(page: Page): Promise<string> {
  const username = await signUp(page);
  await verifyContacts(username);
  return username;
}

test("paid plan: Pay → Check your phone → webhook completed → You're all set → back to the title", async ({
  page,
}) => {
  const username = await verifiedMember(page);
  await page.goto(`/signup/plan?next=${encodeURIComponent("/title/neon-tide")}`);
  await page.getByRole("radio", { name: /Mwanzo/ }).click();
  await page.getByRole("button", { name: /Skip the trial/ }).click();

  await page.waitForURL(/\/payment\?plan=mwanzo/);
  await expect(page.getByText(/Step\s*3\s*of\s*3/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set up your payment" })).toBeVisible();
  await expect(page.getByTestId("plan-summary")).toContainText("Mwanzo");
  await expect(page.getByTestId("plan-summary")).toContainText("TSh 1,500/month");
  await expect(page.getByTestId("due-today")).toHaveText("TSh 1,500");
  await expect(page.getByLabel("Payment phone number")).toHaveValue(/^071\d{7}$/);
  await expect(page.getByRole("list", { name: "Supported networks" }).getByTestId("network-mixx")).toBeVisible();
  await expect(page.getByText(/renews every 30 days until you cancel/)).toBeVisible();
  await page.waitForTimeout(400); // entrance animation
  await page.screenshot({ path: "../docs/screenshots/payment-setup.png" });

  // Double-clicking Pay sends exactly one request.
  let posts = 0;
  page.on("request", (r) => r.method() === "POST" && r.url().endsWith("/billing/checkout/start") && posts++);
  await page.getByRole("button", { name: "Pay TSh 1,500" }).dblclick();
  const approval = page.getByTestId("approval");
  await expect(approval).toContainText("Check your phone");
  await expect(approval).toContainText(/Enter your PIN on 071\d ••• \d{3} to approve TSh 1,500/);
  await expect(page.getByRole("timer")).toBeVisible();
  expect(posts).toBe(1);
  await page.screenshot({ path: "../docs/screenshots/payment-check-your-phone.png" });

  const payment = await latestPayment(username);
  expect(payment).toMatchObject({ status: "pending", purpose: "signup", amount: 1500 });
  await snippeWebhook(payment.reference, "payment.completed");

  const success = page.getByTestId("checkout-success");
  await expect(success).toContainText("You're all set", { timeout: 20_000 });
  await expect(page.getByTestId("next-billing")).toBeVisible();
  await page.waitForTimeout(1000); // the check draws in
  await page.screenshot({ path: "../docs/screenshots/payment-success.png" });
  await page.getByRole("button", { name: "Start watching" }).click();
  await page.waitForURL(/\/title\/neon-tide/);
  await expect(page.getByText(/Welcome to Mwanzo/)).toBeVisible();

  await page.goto("/account/membership");
  await expect(page.getByTestId("membership-card")).toContainText("Mwanzo");
  await expect(page.getByTestId("payment-history")).toContainText("Paid");
});

test("a declined request says why and Try again sends a new one", async ({ page }) => {
  const username = await verifiedMember(page);
  await page.goto("/payment?plan=kinara&next=%2Fbrowse");
  await page.getByRole("button", { name: "Pay TSh 5,000" }).click();
  await expect(page.getByTestId("approval")).toContainText("Check your phone");
  const first = await latestPayment(username);
  await snippeWebhook(first.reference, "payment.failed", { failure_reason: "Insufficient balance" });
  await expect(page.getByTestId("payment-failure")).toContainText("Insufficient balance", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("approval")).toContainText("Check your phone");
  const second = await latestPayment(username);
  expect(second.id).not.toBe(first.id);
  expect(second.status).toBe("pending");
});

test("free trial: no charge, live countdown; at its end a push, then a failed payment → free plan with a notice", async ({
  page,
}) => {
  const username = await verifiedMember(page);
  await page.goto("/signup/plan?next=%2Fbrowse");
  await page.getByRole("radio", { name: /Pendwa/ }).click();
  await page.getByRole("button", { name: "Start free trial" }).click();
  await page.waitForURL(/\/payment\?plan=pendwa&trial=1/);
  await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
  await expect(page.getByTestId("due-today")).toHaveText("TSh 0");
  await page.getByRole("button", { name: "Start free trial" }).click();
  const success = page.getByTestId("checkout-success");
  await expect(success).toContainText("Your free trial has started");
  await expect(success).toContainText(/We'll send a payment request to 071\d ••• \d{3}/);
  await page.waitForTimeout(1000); // the check draws in
  await page.screenshot({ path: "../docs/screenshots/trial-success.png" });
  await page.getByRole("button", { name: "Start watching" }).click();
  await page.waitForURL("**/browse**");

  await page.goto("/account/membership");
  const card = page.getByTestId("membership-card");
  await expect(card).toContainText("Free trial");
  const countdown = page.getByTestId("membership-countdown");
  const before = await countdown.innerText();
  await expect(countdown).not.toHaveText(before, { timeout: 3000 });
  // The member already has Pendwa's limits (4 h a day).
  await expect(card).toContainText("Pendwa");
  await expect(card).toContainText("4 hours a day");
  await page.screenshot({ path: "../docs/screenshots/account-trial-countdown.png", fullPage: true });

  // Simulated trial end: the renewal job pushes the conversion payment…
  const sub = (await (await adminApi(`subscribers/${await subscriberId(username)}`)).json()) as {
    trial_end: string;
  };
  const after = (ms: number) => new Date(new Date(sub.trial_end).getTime() + ms).toISOString();
  const run1 = await (await adminApi("testing/run-renewals", { method: "POST", body: JSON.stringify({ at: after(60_000) }) })).json();
  expect(run1).toMatchObject({ charged: 1, reminded: 1 });
  const push = await latestPayment(username);
  expect(push).toMatchObject({ purpose: "trial_conversion", status: "pending", amount: 2500 });
  // …the member doesn't approve it, and grace runs out: back to the free plan, with a notice.
  await snippeWebhook(push.reference, "payment.failed", { failure_reason: "Request timed out" });
  const run2 = await (await adminApi("testing/run-renewals", { method: "POST", body: JSON.stringify({ at: after(3 * 86_400_000 + 120_000) }) })).json();
  expect(run2.ended).toBeGreaterThanOrEqual(1);
  await page.reload();
  await expect(card).toContainText("Bure");
  await expect(page.getByTestId("billing-notice")).toContainText("free plan");
  await page.getByTestId("billing-notice").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("billing-notice")).toHaveCount(0);
});
