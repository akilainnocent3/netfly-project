import { expect, test } from "@playwright/test";
import { countRequests, homeRows, PASSWORD, signUp } from "./helpers";

const CLIENT = process.env.NETFLY_CLIENT_URL ?? "http://localhost:3000";
let currentUser = "";

async function viewerToken(username: string): Promise<string> {
  const res = await fetch(`${CLIENT}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD, app: "client" }),
  });
  return ((await res.json()) as { access: string }).access;
}

test.beforeEach(async ({ page }) => {
  currentUser = await signUp(page);
});

test("header: six destinations, solid #141414 once scrolled", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Primary" }).first();
  for (const label of ["Home", "Series", "Films", "New & Popular", "My List", "Categories"])
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await homeRows(page);
  await page.mouse.wheel(0, 900);
  await expect(page.locator("header").first()).toHaveCSS("background-color", "rgb(20, 20, 20)");
});

test("Series and Films pages only show their type", async ({ page }) => {
  const home = page.waitForResponse(
    (r) => r.url().includes("/api/v1/browse/home") && r.url().includes("type=series"),
  );
  await page.getByRole("navigation", { name: "Primary" }).first().getByRole("link", { name: "Series" }).click();
  await expect(page).toHaveURL(/\/series/);
  await expect(page.getByRole("heading", { level: 1, name: "Series" })).toBeAttached();
  const body = (await (await home).json()) as { rows: Array<{ items: Array<{ type: string }> }> };
  const types = [...new Set(body.rows.flatMap((row) => row.items.map((i) => i.type)))];
  expect(types).toEqual(["series"]);
  await page.goto("/films");
  await expect(page.getByRole("heading", { level: 1, name: "Films" })).toBeAttached();
});

test("New & Popular: Coming Soon with Remind me (one request per click burst)", async ({ page }) => {
  await page.goto("/new-and-popular");
  const list = page.getByTestId("coming-soon");
  await expect(list.getByRole("heading", { name: "Glass Orchard" })).toBeVisible();
  const item = list.locator("li", { has: page.getByRole("heading", { name: "Glass Orchard" }) });
  const remind = item.getByRole("button", { name: "Remind me" });
  const sent = await countRequests(page, /^PUT \/api\/v1\/reminders\//, async () => {
    await remind.dblclick();
    await expect(item.getByRole("button", { name: "Reminder set" })).toBeVisible();
  });
  expect(sent).toBe(1);
  await page.reload();
  await expect(item.getByRole("button", { name: "Reminder set" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: /Top 10 Films/ }).click();
  await expect(page.getByRole("heading", { name: "Top 10 Films Today" })).toBeVisible();
});

test("hover card: badge-ready meta, genres joined by •, x% Match in #46D369", async ({ page }) => {
  await homeRows(page);
  const card = page.locator("section[aria-labelledby^='row-'] [data-card] a[href^='/title']").first();
  await card.hover();
  const panel = page.getByRole("dialog", { name: /preview$/ });
  await expect(panel).toBeVisible();
  const genres = panel.locator("p", { hasText: "•" });
  if ((await genres.count()) > 0) await expect(genres.first()).toContainText(" • ");
  const match = panel.getByText(/% Match$/);
  if ((await match.count()) > 0) await expect(match.first()).toHaveCSS("color", "rgb(70, 211, 105)");
  await page.mouse.wheel(0, 300);
  await expect(panel).toBeHidden();
});

test("Continue Watching ⋯ → Remove from row", async ({ page }) => {
  // Arrange progress for this viewer through the real API (no media needed).
  const token = await viewerToken(currentUser);
  const title = await (await fetch(`${CLIENT}/api/v1/titles/neon-tide`)).json();
  const res = await fetch(`${CLIENT}/api/v1/playback/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      updates: [{ title_id: title.title.id, position: 600, duration: 2400, watched: 30 }],
    }),
  });
  expect(res.ok).toBe(true);
  await page.goto("/browse");
  const row = page.locator("section", { has: page.getByRole("heading", { name: /^Continue Watching/ }) });
  await expect(row).toBeVisible();
  await row.locator("[data-card] a[href='/title/neon-tide']").first().hover();
  const panel = page.getByRole("dialog", { name: /preview$/ });
  // A card on the bottom edge opens upwards: every button is reachable without scrolling.
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = await panel.boundingBox();
      return box ? box.y + box.height <= viewport.height && box.y >= 0 : false;
    })
    .toBe(true);
  await panel.getByRole("button", { name: /More options for/ }).click();
  await page.getByRole("menuitem", { name: "Remove from row" }).click();
  await expect(page.getByText("Removed Neon Tide from Continue Watching")).toBeVisible();
  await page.reload();
  await homeRows(page);
  await expect(page.getByRole("heading", { name: /^Continue Watching/ })).toHaveCount(0);
});
