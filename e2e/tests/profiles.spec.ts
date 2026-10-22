import type { Page } from "@playwright/test";
import { expect, loaderShown, setConfig, signUp, test } from "./helpers";

// Profiles are behind a global flag: this file turns it on and always turns it back off.
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => setConfig("features.profiles_enabled", true));
test.afterAll(async () => setConfig("features.profiles_enabled", false));

/** The SSR public config is cached ~15 s: reload until the client sees the flag. */
async function waitForGate(page: Page) {
  await expect(async () => {
    await page.goto("/browse");
    await expect(page.getByTestId("profile-gate")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000, intervals: [1_000, 2_000, 4_000] });
}

test("profile gate: create, choose, switch, kids filter", async ({ page }) => {
  await signUp(page);
  await waitForGate(page);
  const gate = page.getByTestId("profile-gate");
  await expect(gate.getByRole("heading", { name: "Who's watching?" })).toBeVisible();

  for (const [name, kids] of [["Grown-up", false], ["Little", true]] as const) {
    await gate.getByRole("button", { name: "Add Profile" }).click();
    const editor = page.getByRole("dialog", { name: "Add Profile" });
    await editor.getByLabel("Name").fill(name);
    if (kids) await editor.getByRole("switch", { name: /Kids profile/ }).click();
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(gate.getByRole("button", { name: `Watch as ${name}` })).toBeVisible();
  }

  await gate.getByRole("button", { name: "Watch as Grown-up" }).click();
  await expect(gate).toBeHidden();
  await page.waitForSelector("section[aria-labelledby^='row-']");
  const sentHeader = page.waitForRequest((r) => r.url().includes("/api/v1/my-list/") && !!r.headers()["x-profile"]);
  await page.goto("/title/neon-tide");
  await page.getByRole("dialog").getByRole("button", { name: "Add to My List" }).first().click();
  await sentHeader;

  // Switch from the header menu: the list is per profile.
  await page.goto("/my-list");
  await expect(page.getByRole("link", { name: /Neon Tide/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Profile menu, watching as Grown-up/ }).click();
  await page.getByRole("menuitem", { name: "Little" }).click();
  await expect(page.getByRole("link", { name: /Neon Tide/ })).toHaveCount(0);

  // Kids profile: a PG-13 title is not reachable (kids ratings are G / PG / TV-Y / TV-PG).
  await page.goto("/title/neon-tide");
  await expect(page.getByText("This title isn't available")).toBeVisible();

  // A full page load remembers the choice (no gate), still on the kids profile. (Not a reload of
  // the title URL: the modal would make the header inert, so its menu has no accessible name.)
  await page.goto("/browse");
  await expect(page.getByTestId("profile-gate")).toBeHidden();
  await expect(page.getByRole("button", { name: /watching as Little/ })).toBeVisible();
});

test("boot: a full-screen brand loader while profiles load", async ({ page }) => {
  await signUp(page);
  await waitForGate(page);
  // Hold the profile list so the boot screen stays up.
  await page.route("**/api/v1/profiles", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.fallback();
  });
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/browse");
    const boot = page.locator("[aria-busy] .nf-loader[data-size=lg]:has(svg)");
    await loaderShown(boot);
    await expect(boot).toHaveAttribute("role", "status");
    await page.screenshot({ path: `../docs/screenshots/loader-boot-${viewport.width}.png` });
    await expect(page.getByTestId("profile-gate")).toBeVisible();
  }
});
