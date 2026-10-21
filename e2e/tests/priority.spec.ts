import type { Page } from "@playwright/test";
import { adminToken, expect, PASSWORD, signUp, skipAppIntro, test } from "./helpers";

// Changes a title's global recommendation priority: runs in its own project after the rest.
const CLIENT = process.env.NETFLY_CLIENT_URL ?? "http://localhost:3000";
const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";
test.describe.configure({ mode: "serial" });

let boosted: number | null = null;

test.afterAll(async () => {
  if (boosted === null) return;
  const token = await adminToken();
  await fetch(`${ADMIN}/api/v1/admin/titles/${boosted}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ boost: 0, boost_starts_at: null, boost_ends_at: null }),
  });
});

async function viewerToken(username: string): Promise<string> {
  const res = await fetch(`${CLIENT}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD, app: "client" }),
  });
  return ((await res.json()) as { access: string }).access;
}

type Home = { rows: Array<{ kind: string; items: Array<{ id: number; slug: string }> }> };

async function topPicks(token: string): Promise<Array<{ id: number; slug: string }>> {
  const res = await fetch(`${CLIENT}/api/v1/browse/home`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const home = (await res.json()) as Home;
  return home.rows.find((r) => r.kind === "top_picks")?.items ?? [];
}

async function studioLogin(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Username").fill(process.env.NETFLY_ADMIN_USER ?? "admin");
  await page.getByLabel("Password").fill(process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("Studio +3 boost reaches Top picks for existing and new viewers without the cache wait", async ({
  page,
  browser,
}) => {
  // An existing viewer whose home feed is already computed (and cached for 15 min).
  const existing = await viewerToken(await signUp(page));
  const before = await topPicks(existing);
  test.skip(before.length < 4, "Needs a catalog with at least 4 Top picks.");
  const target = before[before.length - 1]!;
  expect(before.slice(0, 2).map((t) => t.id)).not.toContain(target.id);

  const studio = await browser.newPage();
  await studioLogin(studio);
  await studio.goto(`${ADMIN}/titles/${target.id}`);
  await studio.getByRole("tab", { name: "publishing" }).click();
  const control = studio.getByRole("radiogroup", { name: "Recommendation priority" });
  await control.getByRole("radio", { name: "+3" }).click();
  boosted = target.id;
  await expect(control.getByRole("radio", { name: "+3" })).toHaveAttribute("aria-checked", "true");
  await expect(studio.getByText("Saved")).toBeVisible();
  await expect(studio.getByTestId("priority-explanation")).toContainText("higher");
  const savedAt = Date.now();

  // Existing viewer: the boosted title is pinned into the first slots on the next request.
  await expect
    .poll(async () => (await topPicks(existing)).slice(0, 2).map((t) => t.id), { timeout: 3_000 })
    .toContain(target.id);
  expect(Date.now() - savedAt).toBeLessThan(2_000);

  // ...and on screen: the first Top picks cards include it.
  await page.goto("/browse");
  const row = page.locator("section[aria-labelledby^='row-']", {
    has: page.getByRole("heading", { name: /Top picks/ }),
  });
  const firstTwo = row.locator("[data-card] a[href^='/title/']").filter({ visible: true });
  await expect(firstTwo.first()).toBeVisible();
  const hrefs = await firstTwo.evaluateAll((els) =>
    els.slice(0, 2).map((el) => el.getAttribute("href") ?? ""),
  );
  expect(hrefs.some((h) => h.includes(`/title/${target.slug}`))).toBe(true);

  // A brand-new viewer gets it too (cold start).
  const other = await browser.newPage();
  await skipAppIntro(other);
  const fresh = await viewerToken(await signUp(other));
  expect((await topPicks(fresh)).slice(0, 2).map((t) => t.id)).toContain(target.id);
});
