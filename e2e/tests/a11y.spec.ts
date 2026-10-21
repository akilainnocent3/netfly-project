import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, homeRows, signUp, test, verifyContacts } from "./helpers";

/** WCAG 2.1 A/AA via axe. Failures list the rule and the first offending selectors. */
async function audit(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`,
  );
  expect(summary).toEqual([]);
}

test.describe("signed out", () => {
  test("/login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page);
  });

  test("/login/forgot", async ({ page }) => {
    await page.goto("/login/forgot");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(400); // entrance animation
    await audit(page);
  });

  test("landing and public title page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page);
    await page.goto("/title/neon-tide");
    await expect(page.getByRole("heading", { level: 1, name: "Neon Tide" })).toBeVisible();
    await audit(page);
  });
});

test.describe("signed in", () => {
  let member = "";
  test.beforeEach(async ({ page }) => {
    member = await signUp(page);
  });

  test("/browse", async ({ page }) => {
    await homeRows(page);
    await audit(page);
  });

  test("title modal traps focus and passes axe", async ({ page }) => {
    await homeRows(page);
    await page.goto("/title/neon-tide");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Neon Tide" }).first()).toBeVisible();
    await audit(page, "[role=dialog]");
    // Focus stays inside the modal however far you tab.
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("/search", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("searchbox", { name: "Search" }).locator("visible=true").first()).toBeVisible();
    await audit(page);
  });

  test("/account", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("membership-card")).toBeVisible();
    await audit(page);
  });

  test("/account/membership and /account/usage", async ({ page }) => {
    await page.goto("/account/membership");
    await expect(page.getByTestId("membership-card")).toBeVisible();
    await audit(page);
    await page.goto("/account/usage");
    await expect(page.getByTestId("usage-month")).toBeVisible();
    await audit(page);
  });

  test("/verify/email and /verify/phone (light layout)", async ({ page }) => {
    for (const path of ["/verify/email?from=account", "/verify/phone?from=account"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
      await page.waitForTimeout(400);
      await audit(page);
    }
  });

  test("/payment (light layout)", async ({ page }) => {
    await verifyContacts(member);
    await page.goto("/payment?plan=pendwa&next=%2Fbrowse");
    await expect(page.getByRole("button", { name: "Pay TSh 2,500" })).toBeVisible();
    await page.waitForTimeout(400); // entrance animation
    await audit(page);
  });

  test("/signup/plan (light layout)", async ({ page }) => {
    await page.goto("/signup/plan?from=account");
    await expect(page.getByRole("radio", { checked: true })).toBeVisible();
    await page.waitForTimeout(400); // entrance animation (contrast is measured on final colours)
    await audit(page);
  });

  test("rows are keyboard navigable", async ({ page }) => {
    await homeRows(page);
    const first = page.locator("section[aria-labelledby^='row-'] [data-card] a[href^='/title']").first();
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
