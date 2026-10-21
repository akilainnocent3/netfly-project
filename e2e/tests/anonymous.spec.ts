import type { Page } from "@playwright/test";
import {
  createAccount,
  expect,
  homeRows,
  PASSWORD,
  submitSignIn,
  test,
  titleBySlug,
  uniqueName,
  viewerToken,
} from "./helpers";

/** Complete sign-up from wherever the gate sent us (the signup page keeps `next`). */
async function completeSignup(page: Page): Promise<void> {
  await page.waitForURL(/\/signup/);
  await page.locator("input[name=username]").pressSequentially(uniqueName(), { delay: 10 });
  await expect(page.getByText("Nice — it’s yours if you want it.")).toBeVisible();
  await page.locator("input[name=name]").fill("Gate Viewer");
  await page.locator("input[name=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Get started" }).click();
}

async function myList(username: string): Promise<number[]> {
  const token = await viewerToken(username);
  const res = await fetch(`${process.env.NETFLY_CLIENT_URL ?? "http://localhost:3000"}/api/v1/my-list?translation=all`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as Array<{ id: number }> | { results: Array<{ id: number }> };
  return (Array.isArray(body) ? body : body.results).map((t) => t.id);
}

test("signed-out visitors browse the real app: header with Sign In, rows, modal, pages", async ({ page }) => {
  await page.goto("/browse");
  const header = page.locator("header").first();
  await expect(header.getByRole("link", { name: "Sign In" })).toBeVisible();
  const rows = await homeRows(page);
  expect(rows.length).toBeGreaterThan(2);
  expect(rows.join("|")).not.toMatch(/Continue Watching|My List|Because you/);
  await expect(header.getByRole("link", { name: "My List" })).toHaveCount(0);
  await page.screenshot({ path: "../docs/screenshots/signed-out-home.png" });
  await page.locator("section[aria-labelledby^='row-'] [data-card] a[href^='/title']").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  for (const path of ["/new-and-popular", "/series", "/films", "/categories", "/search?q=neon"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    expect(page.url()).not.toContain("/login");
  }
});

test("Play opens the gate; Sign In lands straight in the player", async ({ page }) => {
  const username = await createAccount();
  await page.goto("/browse");
  const hero = page.locator("section[aria-label='Featured']");
  await hero.getByRole("link", { name: "Play" }).first().click();
  const gate = page.getByTestId("auth-gate");
  await expect(gate.getByRole("heading", { name: "Ready to watch?" })).toBeVisible();
  await expect(gate).toContainText("Create an account or sign in to start watching");
  await page.screenshot({ path: "../docs/screenshots/auth-gate.png" });
  await gate.getByRole("link", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fwatch%2F/);
  await submitSignIn(page, username);
  await page.waitForURL(/\/watch\/[a-z0-9-]+/);
});

test("My List from a title page → Create account → back on the title, added", async ({ page }) => {
  const title = await titleBySlug("paper-kings");
  await page.goto("/title/paper-kings?translation=translated");
  await page.getByRole("dialog").getByRole("button", { name: "Add to My List" }).first().click();
  const gate = page.getByTestId("auth-gate");
  await expect(gate).toContainText(`add ${title.title} to My List`);
  await gate.getByRole("link", { name: "Create account" }).click();
  await completeSignup(page);
  await page.waitForURL(/\/title\/paper-kings/);
  await expect(page.getByText(`Added ${title.title} to My List`)).toBeVisible();
  await expect(page).not.toHaveURL(/intent=/);
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Remove from My List" }).first(),
  ).toBeVisible();
});

test("Rate from a hover card → Sign In → rated, back at the same scroll position", async ({ page }) => {
  const username = await createAccount();
  await page.goto("/browse");
  await homeRows(page);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(800);
  // A card in the middle of the (scrolled) viewport, so its preview fits on screen.
  const cards = page.locator("section[aria-labelledby^='row-'] [data-card] a[href^='/title']");
  let box: { x: number; y: number; width: number; height: number } | null = null;
  for (let i = 0; i < (await cards.count()) && !box; i++) {
    const b = await cards.nth(i).boundingBox();
    if (b && b.y > 260 && b.y < 520 && b.x > 40 && b.x + b.width < 1100) box = b;
  }
  expect(box).not.toBeNull();
  // Previews open only after the pointer itself moves (not when scrolling slides a card under it).
  await page.mouse.move(box!.x + box!.width / 2 - 10, box!.y + box!.height / 2);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 4 });
  const panel = page.getByRole("dialog", { name: /preview$/ });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Rate this title" }).hover();
  // The bloom springs open over the thumb; click it in place (moving the pointer away closes it).
  await panel.getByRole("menuitemradio", { name: "I like this" }).dispatchEvent("click");
  const gate = page.getByTestId("auth-gate");
  await expect(gate).toContainText("rate");
  // Where the visitor was when they needed an account: that's where they come back to.
  const atGate = await page.evaluate(() => window.scrollY);
  expect(atGate).toBeGreaterThan(200);
  await gate.getByRole("link", { name: "Sign In" }).click();
  await submitSignIn(page, username);
  await page.waitForURL(/\/browse/);
  await expect(page.getByText(/^Rated /)).toBeVisible();
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - atGate), { timeout: 6000 })
    .toBeLessThan(8);
});

test("Remind me from New & Popular → Sign In → reminder set", async ({ page }) => {
  const username = await createAccount();
  await page.goto("/new-and-popular");
  const list = page.getByTestId("coming-soon");
  const item = list.locator("li", { has: page.getByRole("heading", { name: "Glass Orchard" }) });
  await item.getByRole("button", { name: "Remind me" }).click();
  const gate = page.getByTestId("auth-gate");
  await expect(gate).toContainText("get a reminder for Glass Orchard");
  await gate.getByRole("link", { name: "Sign In" }).click();
  await submitSignIn(page, username);
  await page.waitForURL(/\/new-and-popular/);
  await expect(page.getByText("We'll let you know when Glass Orchard is out")).toBeVisible();
  await expect(item.getByRole("button", { name: "Reminder set" })).toBeVisible();
});

test("a crafted ?intent= link never acts by itself", async ({ page }) => {
  const username = await createAccount();
  const title = await titleBySlug("neon-tide");
  await page.goto("/login");
  await submitSignIn(page, username);
  await page.waitForURL(/\/browse/);
  await page.goto(`/browse?intent=my_list.neon-tide.${title.id}`);
  await expect(page.getByText(/Finish what you started/)).toBeVisible();
  await page.waitForTimeout(800);
  expect(await myList(username)).not.toContain(title.id);
  await page.getByRole("button", { name: "Add to My List" }).last().click();
  await expect.poll(() => myList(username)).toContain(title.id);
});

test("account pages still need an account", async ({ request }) => {
  for (const path of ["/account", "/my-list", "/watch/neon-tide"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers()["location"]).toContain(`/login?next=${encodeURIComponent(path)}`);
  }
});
