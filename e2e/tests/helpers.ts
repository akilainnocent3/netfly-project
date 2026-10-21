import { expect, type Page } from "@playwright/test";

export const PASSWORD = "stream-all-night-42";

export function uniqueName(prefix = "e2e"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 30);
}

/** Sign up: live checks while typing, then an explicit press of the primary button. */
export async function signUp(page: Page, username = uniqueName()): Promise<string> {
  await page.goto("/signup");
  await page.locator("input[name=username]").pressSequentially(username, { delay: 10 });
  await expect(page.getByText("Nice — it’s yours if you want it.")).toBeVisible();
  await page.locator("input[name=name]").fill("E2E Viewer");
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Get started" }).click();
  await page.waitForURL("**/browse**");
  return username;
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
