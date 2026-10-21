import { createHmac } from "node:crypto";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { E2E_WEBHOOK_SECRET } from "../global-setup";

export { expect };

/** Mark the app-open splash as already seen (intro.spec.ts covers the splash itself). */
export async function skipAppIntro(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript(() => {
    try {
      sessionStorage.setItem("netfly-intro-app", "1");
    } catch {
      /* ignore */
    }
  });
}

/** `test` for specs that aren't about the splash: every page starts with it already seen. */
export const test = base.extend({
  context: async ({ context }, use) => {
    await skipAppIntro(context);
    await use(context);
  },
});

export const PASSWORD = "stream-all-night-42";

export function uniqueName(prefix = "e2e"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 30);
}

/** Sign up through the three steps (name → username with live check → password). */
export async function signUp(page: Page, username = uniqueName()): Promise<string> {
  await page.goto("/signup");
  await completeSignupSteps(page, username);
  await page.waitForURL("**/browse**");
  return username;
}

/**
 * Walk the signup steps from step 1 (wherever the visitor was sent from), then keep the
 * preselected free plan ("Start watching") unless `plan: false`.
 */
export async function completeSignupSteps(
  page: Page,
  username = uniqueName(),
  opts: { plan?: boolean } = {},
): Promise<string> {
  await page.waitForURL(/\/signup\/name/);
  await page.locator("input[name=name]").fill("E2E Viewer");
  await page.getByRole("button", { name: "Next" }).click();
  await page.waitForURL(/\/signup\/username/);
  await page.locator("input[name=username]").pressSequentially(username, { delay: 10 });
  await expect(page.getByText("Nice — it’s yours if you want it.")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.waitForURL(/\/signup\/password/);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Finish" }).click();
  if (opts.plan !== false) await chooseFreePlan(page);
  return username;
}

/** Plan picker after signup: Free is preselected, so "Start watching" keeps it. */
export async function chooseFreePlan(page: Page): Promise<void> {
  await page.waitForURL(/\/signup\/plan/);
  await expect(page.getByRole("radio", { checked: true })).toContainText("Bure");
  await page.getByRole("button", { name: "Start watching" }).click();
}

const CLIENT_URL = process.env.NETFLY_CLIENT_URL ?? "http://localhost:3000";

/** Create a viewer account through the API (Node side), for sign-in flows. */
export async function createAccount(username = uniqueName()): Promise<string> {
  const res = await fetch(`${CLIENT_URL}/api/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, full_name: "E2E Viewer", password: PASSWORD, app: "client" }),
  });
  if (!res.ok) throw new Error(`signup ${res.status}`);
  return username;
}

/** A viewer's access token (Node side) for arranging or checking state through the API. */
export async function viewerToken(username: string): Promise<string> {
  const res = await fetch(`${CLIENT_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD, app: "client" }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return ((await res.json()) as { access: string }).access;
}

/** Fill the sign-in form that is already on screen (e.g. after the auth gate) and submit it. */
export async function submitSignIn(page: Page, username: string): Promise<void> {
  await page.locator("input[name=username]").fill(username);
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
}

/** Public title data (id + name) by slug. */
export async function titleBySlug(slug: string): Promise<{ id: number; title: string; slug: string }> {
  const res = await fetch(`${CLIENT_URL}/api/v1/titles/${slug}`);
  if (!res.ok) throw new Error(`title ${slug}: ${res.status}`);
  return ((await res.json()) as { title: { id: number; title: string; slug: string } }).title;
}

export async function homeRows(page: Page) {
  await page.waitForSelector("section[aria-labelledby^='row-']");
  return page.locator("section[aria-labelledby^='row-'] h2").allInnerTexts();
}

/** First title that has a ready video, via the API (null when media isn't set up). */
export async function playableSlug(page: Page, type: "movie" | "series"): Promise<string | null> {
  return page.evaluate(async (wanted) => {
    const mode = new URL(location.href).searchParams.get("translation") ?? "translated";
    for (const m of [mode, mode === "translated" ? "not_translated" : "translated"]) {
      const res = await fetch(`/api/v1/browse/billboard?translation=${m}`);
      const items = (await res.json()) as Array<{ title: { slug: string; type: string; has_preview: boolean } }>;
      const hit = items.find((i) => i.title.type === wanted && i.title.has_preview);
      if (hit) return hit.title.slug;
    }
    return null;
  }, type);
}

const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";

/** Staff access token for arranging state through the admin API (Node side, not the page). */
export async function adminToken(): Promise<string> {
  const res = await fetch(`${ADMIN}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.NETFLY_ADMIN_USER ?? "admin",
      password: process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin",
      app: "admin",
    }),
  });
  if (!res.ok) throw new Error(`admin login ${res.status}`);
  return ((await res.json()) as { access: string }).access;
}

export async function setConfig(key: string, value: unknown): Promise<void> {
  const token = await adminToken();
  const res = await fetch(`${ADMIN}/api/v1/admin/config/${key}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`set ${key}: ${res.status}`);
}

/** Count API requests matching `pattern` (method + path) while `action` runs. */
export async function countRequests(
  page: Page,
  pattern: RegExp,
  action: () => Promise<void>,
): Promise<number> {
  let n = 0;
  const listener = (r: { method: () => string; url: () => string }) => {
    if (pattern.test(`${r.method()} ${new URL(r.url()).pathname}`)) n += 1;
  };
  page.on("request", listener);
  await action();
  page.off("request", listener);
  return n;
}

/** HLS renditions are H.264/AAC; Playwright's bundled Chromium can't decode them (use NETFLY_E2E_CHANNEL=chrome). */
export async function canPlayH264(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      typeof MediaSource !== "undefined" &&
      MediaSource.isTypeSupported('video/mp4; codecs="avc1.640028"') &&
      MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"'),
  );
}

/** Test mode only: the latest code sent to an email / phone (Studio's outbox). */
export async function outboxCode(kind: "sms" | "email", to: string): Promise<string> {
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
export function uniquePhone(): string {
  return `071${String(Date.now()).slice(-7)}`;
}

/** Test mode only: verify an email and a phone for a viewer through the API (Node side). */
export async function verifyContacts(username: string): Promise<{ email: string; phone: string }> {
  const token = await viewerToken(username);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const email = `${username}@example.com`.toLowerCase();
  const phone = uniquePhone();
  for (const [channel, value, kind] of [
    ["email", email, "email"],
    ["phone", phone, "sms"],
  ] as const) {
    const sent = await fetch(`${CLIENT_URL}/api/v1/auth/verify/${channel}/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({ value }),
    });
    if (!sent.ok) throw new Error(`verify ${channel}: ${sent.status} ${await sent.text()}`);
    const target = ((await sent.json()) as { target: string }).target;
    const code = await outboxCode(kind, target);
    const done = await fetch(`${CLIENT_URL}/api/v1/auth/verify/${channel}/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({ code }),
    });
    if (!done.ok) throw new Error(`confirm ${channel}: ${done.status}`);
  }
  return { email, phone };
}

/** Superadmin API call (Node side) for arranging state. */
export async function adminApi(path: string, init: RequestInit = {}): Promise<Response> {
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

/** Android Chrome's WebOTP, simulated: the page's request resolves when the "SMS" arrives. */
export async function stubWebOtp(page: Page) {
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

export type AdminPayment = { id: string; reference: string; status: string; purpose: string; amount: number };

export async function subscriberId(username: string): Promise<number> {
  const res = await adminApi(`subscribers?q=${username}`);
  const body = (await res.json()) as { results: Array<{ id: number; username: string }> };
  return body.results.find((s) => s.username === username)!.id;
}

export async function latestPayment(username: string): Promise<AdminPayment> {
  const id = await subscriberId(username);
  for (let i = 0; i < 20; i++) {
    const rows = (await (await adminApi(`subscribers/${id}/payments`)).json()) as AdminPayment[];
    if (rows[0]) return rows[0];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no payment");
}

/** Snippe's webhook: HMAC-SHA256 of "{timestamp}.{raw body}" with the whsec_ secret. */
export async function snippeWebhook(
  reference: string,
  type: "payment.completed" | "payment.failed",
  extra: Record<string, unknown> = {},
) {
  const body = JSON.stringify({
    id: `evt_${reference}_${type}`,
    type,
    api_version: "2026-01-25",
    created_at: new Date().toISOString(),
    data: {
      reference,
      status: type.split(".")[1],
      amount: { value: 0, currency: "TZS" },
      channel: { type: "mobile", provider: "mixx" },
      ...extra,
    },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", E2E_WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex");
  const res = await fetch(`${CLIENT_URL}/api/v1/payments/webhook/snippe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Timestamp": ts,
      "X-Webhook-Signature": signature,
    },
    body,
  });
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("OK");
}
