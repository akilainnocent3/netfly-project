import type { Page } from "@playwright/test";
import {
  adminToken,
  completeSignupSteps,
  createAccount,
  expect,
  setConfig,
  signUp,
  submitSignIn,
  test,
  uniqueName,
} from "./helpers";

// Providers are simulated (testing.mock_providers): codes are read from Studio's test outbox.
const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await setConfig("testing.mock_providers", true);
  // Every e2e request comes from one IP: lift the per-IP code limit (10/hour) for this file.
  await setConfig("security.rate_otp_send", "500/hour");
});
test.afterAll(async () => {
  await setConfig("testing.mock_providers", false);
  await setConfig("security.rate_otp_send", "10/hour");
});

async function outboxCode(kind: "sms" | "email", to: string): Promise<string> {
  const token = await adminToken();
  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `${ADMIN}/api/v1/admin/testing/outbox?kind=${kind}&to=${encodeURIComponent(to)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const messages = (await res.json()) as Array<{ body: string }>;
    const match = messages[0]?.body.match(/\b(\d{6})\b/);
    if (match) return match[1]!;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${kind} code for ${to}`);
}

/** A unique Tanzanian Mixx number (071…). */
function uniquePhone(): string {
  return `071${String(Date.now()).slice(-7)}`;
}

/** Android Chrome's WebOTP, simulated: the page's request resolves when the "SMS" arrives. */
async function stubWebOtp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      OTPCredential?: unknown;
      __deliverOtp?: (code: string) => void;
      __otpRequested?: boolean;
    };
    w.OTPCredential ??= function OTPCredential() {};
    let deliver: ((code: string) => void) | null = null;
    w.__deliverOtp = (code) => deliver?.(code);
    const original = navigator.credentials?.get?.bind(navigator.credentials);
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        ...navigator.credentials,
        get: (options: CredentialRequestOptions & { otp?: unknown }) => {
          if (!options?.otp) return original?.(options);
          w.__otpRequested = true;
          return new Promise((resolve, reject) => {
            deliver = (code) => resolve({ code, type: "otp" });
            options.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")));
          });
        },
      },
    });
  });
}

test("trial: plan → email code (paste) → phone code (auto-filled by WebOTP) → payment step", async ({
  page,
}) => {
  await stubWebOtp(page);
  await page.goto("/signup");
  await completeSignupSteps(page, uniqueName("trial"), { plan: false });
  await page.waitForURL(/\/signup\/plan/);
  await page.getByRole("radio", { name: /Pendwa/ }).click();
  await page.getByRole("button", { name: "Start free trial" }).click();

  // STEP 1 OF 3 · email
  await page.waitForURL(/\/verify\/email/);
  await expect(page.getByText(/Step\s*1\s*of\s*3/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "What's your email?" })).toBeVisible();
  const email = `${uniqueName("mail")}@example.com`;
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page).toHaveURL(/stage=code/);
  await expect(page.getByRole("heading", { name: "Enter the code we sent" })).toBeVisible();
  await expect(page.getByTestId("sent-to")).toHaveText(/•••.*@example\.com/);
  await expect(page.getByRole("button", { name: /Resend code in \d:\d\d/ })).toBeDisabled();
  await expect(page.getByRole("group", { name: /Verification code/ })).toBeVisible();
  const emailCode = await outboxCode("email", email);
  // A wrong code clears the boxes and says why.
  await page.getByTestId("code-digit-0").focus();
  await page.keyboard.insertText(emailCode === "000000" ? "111111" : "000000");
  await expect(page.getByText("That code isn't right.")).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/verify-email-code.png" });
  // Paste fills every box and submits.
  await page.getByTestId("code-digit-0").focus();
  await page.keyboard.insertText(emailCode);

  // STEP 2 OF 3 · phone
  await page.waitForURL(/\/verify\/phone/);
  await expect(page.getByText(/Step\s*2\s*of\s*3/i)).toBeVisible();
  const phone = uniquePhone();
  await page.getByLabel("Mobile number").fill(phone);
  await expect(page.getByTestId("network-mixx")).toBeVisible(); // 071… = Mixx by Yas
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByTestId("sent-to")).toHaveText(/^071\d ••• \d{3}$/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __otpRequested?: boolean }).__otpRequested)).toBe(true);
  await page.screenshot({ path: "../docs/screenshots/verify-phone-otp.png" });
  const smsCode = await outboxCode("sms", phone);
  await page.evaluate((code) => (window as unknown as { __deliverOtp: (c: string) => void }).__deliverOtp(code), smsCode);

  // STEP 3 OF 3 · payment / trial (next phase), with the plan carried along.
  await page.waitForURL(/\/payment\?plan=pendwa&trial=1/);
});

test("free members are never asked for an email, phone or payment", async ({ page }) => {
  let verifyCalls = 0;
  page.on("request", (r) => /\/api\/v1\/(auth\/verify|billing\/checkout)/.test(r.url()) && verifyCalls++);
  await signUp(page);
  await page.goto("/browse");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  expect(verifyCalls).toBe(0);
});

test("forgot password: a code to the verified phone resets it and signs the member in", async ({
  page,
}) => {
  const username = await createAccount(uniqueName("forgot"));
  await page.goto("/login");
  await submitSignIn(page, username);
  await page.waitForURL("**/browse**");
  // Add and verify a phone from Account → Security.
  await page.goto("/account/security");
  await expect(page.getByTestId("contact-phone")).toContainText("Not added");
  await page.getByTestId("contact-phone").getByRole("link", { name: "Add" }).click();
  await page.waitForURL(/\/verify\/phone\?from=account/);
  await expect(page.getByText(/Step\s*\d\s*of/i)).toHaveCount(0);
  const phone = uniquePhone();
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByTestId("code-digit-0").focus();
  await page.keyboard.insertText(await outboxCode("sms", phone));
  await page.waitForURL(/\/account\/security/);
  await expect(page.getByTestId("contact-phone")).toContainText("Verified");
  await expect(page.getByTestId("contact-phone")).toContainText("Mixx by Yas");

  // Sign out, then reset the password with the phone number.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.waitForURL(/\/login\/forgot/);
  await page.getByLabel("Email, phone or username").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Check your messages" })).toBeVisible();
  await page.getByTestId("code-digit-0").focus();
  await page.keyboard.insertText(await outboxCode("sms", phone));
  await expect(page.getByLabel("New password")).toBeFocused();
  await page.getByLabel("New password").fill("a-brand-new-password-9");
  await page.screenshot({ path: "../docs/screenshots/forgot-password.png" });
  await page.getByRole("button", { name: "Reset password" }).click();
  await page.waitForURL("**/browse**");
  await expect(page.getByText("Your password has been changed.", { exact: false })).toBeVisible();
});

test("an unknown account gets the same answer (no account probing)", async ({ page }) => {
  await page.goto("/login/forgot");
  await page.getByLabel("Email, phone or username").fill(uniqueName("ghost"));
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Check your messages" })).toBeVisible();
});
