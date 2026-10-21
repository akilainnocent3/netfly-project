import type { Page } from "@playwright/test";
import {
  adminToken,
  canPlayH264,
  completeSignupSteps,
  expect,
  playableSlug,
  signUp,
  test,
  uniqueName,
  viewerToken,
} from "./helpers";

const CLIENT = process.env.NETFLY_CLIENT_URL ?? "http://localhost:3000";
const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";
/** A hidden plan with a 1-minute daily limit, so a test can spend a whole allowance quickly. */
const TINY = "e2e-tiny";

async function admin(path: string, init: RequestInit = {}) {
  const token = await adminToken();
  return fetch(`${ADMIN}/api/v1/admin/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function tinyPlan(daily = 1): Promise<number> {
  const list = (await (await admin("plans")).json()) as Array<{ id: number; slug: string }>;
  const body = {
    slug: TINY,
    name: "E2E Tiny",
    price_tzs: 100,
    is_free: false,
    is_active: false,
    trial_eligible: false,
    daily_limit_minutes: daily,
    weekly_limit_minutes: 600,
    monthly_limit_minutes: 2000,
  };
  const existing = list.find((p) => p.slug === TINY);
  const res = existing
    ? await admin(`plans/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) })
    : await admin("plans", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`tiny plan: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: number }).id;
}

async function putOnPlan(username: string, plan: string) {
  const subs = (await (await admin(`subscribers?q=${username}`)).json()) as {
    results: Array<{ id: number; username: string }>;
  };
  const id = subs.results.find((s) => s.username === username)!.id;
  const res = await admin(`subscribers/${id}/change-plan`, {
    method: "POST",
    body: JSON.stringify({ plan, days: 30 }),
  });
  if (!res.ok) throw new Error(`change plan ${res.status}`);
}

/** Spend `seconds` of a viewer's allowance through the real metering API (server time). */
async function spendAllowance(username: string, slug: string, seconds = 61) {
  const token = await viewerToken(username);
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const info = (await (await fetch(`${CLIENT}/api/v1/playback/${slug}`, { headers: auth })).json()) as {
    session_id: string;
  };
  const beat = (watched: number, playing: boolean) =>
    fetch(`${CLIENT}/api/v1/playback/heartbeat`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ session_id: info.session_id, watched, playing }),
    }).then((r) => r.json() as Promise<{ allowed: boolean; credited: number }>);
  await beat(0, false);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const last = await beat(seconds, true);
  expect(last.allowed).toBe(seconds < 60);
}

async function usedToday(username: string): Promise<number> {
  const token = await viewerToken(username);
  const res = await fetch(`${CLIENT}/api/v1/billing/usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return ((await res.json()) as { used: { day: number } }).used.day;
}

async function studioLogin(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Username").fill(process.env.NETFLY_ADMIN_USER ?? "admin");
  await page.getByLabel("Password").fill(process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("plan picker: Free preselected, same quality everywhere, paid plans continue to verification", async ({
  page,
}) => {
  await page.goto("/signup");
  await completeSignupSteps(page, uniqueName("plan"), { plan: false });
  await page.waitForURL(/\/signup\/plan/);
  await expect(page.getByRole("heading", { name: "Choose the plan that's right for you" })).toBeVisible();
  const cards = page.getByRole("radio");
  await expect(cards).toHaveCount(4);
  await expect(page.getByRole("radio", { checked: true })).toContainText("Bure");
  // Plans differ only in viewing time: the quality row is identical on every card.
  for (const card of await cards.all()) await expect(card).toContainText("Best (same on every plan)");
  await expect(page.getByText("Upgrade, downgrade or cancel anytime.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start watching" })).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/plan-picker-desktop.png", fullPage: true });

  await page.getByRole("radio", { name: /Pendwa/ }).click();
  await expect(page.getByRole("radio", { name: /Pendwa/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("plan-price").nth(2)).toHaveText("TSh 2,500/month");
  // A new member can start a trial (verification comes next, then payment / trial).
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/verify\/email\?plan=pendwa.*trial=1/);
});

test("plan picker on a phone: stacked, swipeable cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/signup");
  await completeSignupSteps(page, uniqueName("planm"), { plan: false });
  await page.waitForURL(/\/signup\/plan/);
  await expect(page.getByRole("radio", { checked: true })).toContainText("Bure");
  await page.waitForTimeout(500); // entrance animation
  await page.screenshot({ path: "../docs/screenshots/plan-picker-mobile.png" });
  await page.getByRole("radio", { name: /Mwanzo/ }).scrollIntoViewIfNeeded();
  await page.getByRole("radio", { name: /Mwanzo/ }).click();
  await expect(page.getByRole("radio", { name: /Mwanzo/ })).toHaveAttribute("aria-checked", "true");
});

test("Free starts at once with a welcome; Account shows live usage and membership", async ({ page }) => {
  await signUp(page);
  await expect(page.getByText(/Welcome to NETFLY/i)).toBeVisible();
  // Profile menu: one small usage line, nothing on Home itself.
  await expect(page.getByTestId("usage-menu-line")).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByTestId("usage-menu-line")).toHaveText("1h left today");
  await page.keyboard.press("Escape");

  await page.goto("/account/usage");
  for (const scope of ["day", "week", "month"]) await expect(page.getByTestId(`usage-${scope}`)).toBeVisible();
  await expect(page.getByTestId("usage-day")).toContainText("of 1h used");
  const reset = page.getByTestId("resets-day");
  const first = await reset.innerText();
  await expect(reset).not.toHaveText(first, { timeout: 3000 }); // ticks every second
  await expect(page.getByTestId("upgrade-hint")).toHaveCount(0);

  await page.goto("/account/membership");
  await expect(page.getByTestId("membership-card")).toContainText("Bure");
  await expect(page.getByTestId("membership-price")).toHaveText("Free");
  await page.goto("/account");
  await expect(page.getByRole("navigation", { name: "Account" })).toBeVisible();
  await expect(page.getByTestId("membership-card")).toContainText("Bure");
  await expect(page.getByTestId("usage-day")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "../docs/screenshots/account-membership-usage.png", fullPage: true });
});

test("allowance spent: Play opens the limit modal, the player shows the overlay, Account offers an upgrade; a Studio edit applies at once", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await tinyPlan(1);
  const username = await signUp(page);
  await putOnPlan(username, TINY);
  const slug = (await playableSlug(page, "movie")) ?? "neon-tide";
  await spendAllowance(username, slug);

  await page.goto(`/title/${slug}`);
  await page.reload(); // fresh usage snapshot
  await page.getByRole("dialog").getByRole("link", { name: /^Play/ }).first().click();
  const modal = page.getByTestId("usage-limit");
  await expect(modal).toContainText("You've reached today's viewing limit");
  await expect(page.getByTestId("limit-countdown")).toHaveText(/\d{2}:\d{2}:\d{2}/);
  await expect(page).not.toHaveURL(/\/watch\//);

  await page.goto(`/watch/${slug}`);
  await expect(page.getByRole("alertdialog")).toContainText("You've reached today's viewing limit");
  await expect(page.getByRole("link", { name: "Upgrade plan" })).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/player-limit-overlay.png" });

  await page.goto("/account/usage");
  await expect(page.getByTestId("upgrade-hint")).toBeVisible();

  // Studio raises the plan's daily limit: the member sees it on the next sync, no restart.
  await tinyPlan(3);
  await page.reload();
  await expect(page.getByTestId("usage-day")).toContainText("of 3m used");
  await expect(page.getByTestId("upgrade-hint")).toBeVisible();
});

test("mid-playback: a warning toast, then the player pauses under the limit overlay; the intro never counts", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const username = await signUp(page);
  test.skip(!(await canPlayH264(page)), "Needs H.264 (NETFLY_E2E_CHANNEL=chrome).");
  const slug = await playableSlug(page, "movie");
  test.skip(!slug, "No transcoded movie yet.");
  await tinyPlan(1);
  await putOnPlan(username, TINY);
  await spendAllowance(username, slug!, 46); // ~14 s left: less than the 24 s demo movie

  await page.goto(`/watch/${slug}`);
  const preroll = page.getByTestId("intro-preroll");
  await expect(preroll).toBeVisible();
  await expect(page.getByText(/minute of viewing left today/)).toHaveCount(0); // not over the intro
  await expect(preroll).toBeHidden({ timeout: 10_000 }); // plays out
  await expect(page.getByText(/minute of viewing left today/)).toBeVisible();
  const content = page.locator("video:not([aria-hidden=true])");
  await expect(page.getByRole("alertdialog")).toContainText("You've reached today's viewing limit", {
    timeout: 40_000,
  });
  expect(await content.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  const watched = await content.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(watched).toBeLessThan(20);
  // Server-side: 46 s pre-spent + the content seconds; the 3.6 s intro and startup never count.
  await expect.poll(() => usedToday(username)).toBeGreaterThanOrEqual(59);
  expect(await usedToday(username)).toBeLessThanOrEqual(46 + Math.ceil(watched) + 6);
});

test("Studio: Plans (live preview) and Subscribers", async ({ page }) => {
  await studioLogin(page);
  await page.goto(`${ADMIN}/plans`);
  await expect(page.getByTestId("plan-row-pendwa")).toContainText("TSh 2,500/month");
  await page.screenshot({ path: "../docs/screenshots/studio-plans.png" });
  await page.getByRole("button", { name: "Edit Pendwa" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Tagline").fill("Preview only — not saved");
  await expect(editor.getByText("Live preview")).toBeVisible();
  await editor.getByLabel("Daily viewing hours").fill("5");
  await expect(editor.getByText("5 hours a day").first()).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/studio-plan-editor.png" });
  await editor.getByRole("button", { name: "Cancel" }).click();

  await page.goto(`${ADMIN}/subscribers`);
  await expect(page.getByRole("heading", { name: "Subscribers" })).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/studio-subscribers.png" });
  await page.goto(`${ADMIN}/`);
  await expect(page.getByTestId("billing-tiles")).toContainText("MRR");
});

test("Studio: Settings has the usage, email, SMS, payments and test-mode groups", async ({ page }) => {
  await studioLogin(page);
  await page.goto(`${ADMIN}/settings`);
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  for (const [group, file, check] of [
    ["Usage limits", "studio-settings-usage", "Timezone"],
    ["Email", "studio-settings-email", "Send test email"],
    ["SMS (Beem Africa)", "studio-settings-sms", "Check balance"],
    ["Payments (Snippe)", "studio-settings-payments", "Test API key"],
    ["Test mode", "studio-settings-test-mode", "Show outbox"],
  ] as const) {
    await nav.getByRole("button", { name: group }).click();
    await expect(page.getByText(check, { exact: false }).first()).toBeVisible();
    if (group === "Payments (Snippe)") {
      await page.getByRole("button", { name: "Show webhook URL" }).click();
      await expect(page.getByText(/\/api\/v1\/payments\/webhook\/snippe/)).toBeVisible();
    }
    await page.screenshot({ path: `../docs/screenshots/${file}.png`, fullPage: true });
  }
});
