/**
 * The small "Recently added" / "New episodes" / "Leaving soon" ribbon (DECISIONS 52a): its size,
 * that it never covers a card's logo art, that it passes axe, and how it looks at phone and
 * desktop width (docs/screenshots/badge-*.png).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, signUp, test } from "./helpers";

const RIBBONS = /^(Recently added|New episodes|Leaving soon)$/i;

type Home = { rows: Array<{ items: Array<{ badge: string | null }> }> };
type Billboard = Array<{ title: { badge: string | null } }>;

/**
 * A translation mode whose feed has a ribbon (a small catalog ranks everything Top 10), and —
 * for the hero photograph — a page (/browse, /series or /films) whose first billboard title
 * has one too (null when none does).
 */
async function ribbonPlaces(page: Page): Promise<{ mode: string; hero: string | null } | null> {
  return page.evaluate(async () => {
    const ribbon = (b: string | null) => !!b && b !== "top10";
    let found: { mode: string; hero: string | null } | null = null;
    for (const mode of ["translated", "not_translated"]) {
      const home = (await (await fetch(`/api/v1/browse/home?translation=${mode}`)).json()) as Home;
      if (!home.rows.some((r) => r.items.some((i) => ribbon(i.badge)))) continue;
      for (const [path, type] of [["/browse", ""], ["/series", "&type=series"], ["/films", "&type=movie"]]) {
        const bill = (await (
          await fetch(`/api/v1/browse/billboard?translation=${mode}${type}`)
        ).json()) as Billboard;
        if (bill[0] && ribbon(bill[0].title.badge)) return { mode, hero: path! };
      }
      found ??= { mode, hero: null };
    }
    return found;
  });
}

for (const size of [
  { width: 360, height: 780 },
  { width: 1440, height: 900 },
]) {
  test(`badge at ${size.width}px: small, clear of the logo, accessible`, async ({ page }) => {
    await page.setViewportSize(size);
    await signUp(page);
    const places = await ribbonPlaces(page);
    test.skip(!places, "No title in the catalog has a Recently added / New episodes / Leaving soon badge.");
    const mode = places!.mode;
    await page.goto(`/browse?translation=${mode}`);
    await page.waitForSelector("section[aria-labelledby^='row-']");

    const badge = page.locator("section[aria-labelledby^='row-'] a span").filter({ hasText: RIBBONS }).first();
    await badge.scrollIntoViewIfNeeded();
    await expect(badge).toBeVisible();
    const style = await badge.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        font: parseFloat(cs.fontSize),
        padX: parseFloat(cs.paddingLeft),
        padY: parseFloat(cs.paddingTop),
        radius: parseFloat(cs.borderTopLeftRadius),
        transform: cs.textTransform,
      };
    });
    expect(style.font).toBeGreaterThanOrEqual(9);
    expect(style.font).toBeLessThanOrEqual(10);
    expect(style).toMatchObject({ padX: 4, padY: 2, radius: 2, transform: "uppercase" });

    // Bottom-centre of the artwork, and never on top of the logo art.
    const card = badge.locator("xpath=ancestor::a[1]");
    const [b, c] = [await badge.boundingBox(), await card.boundingBox()];
    expect(b && c).toBeTruthy();
    expect(Math.abs(b!.x + b!.width / 2 - (c!.x + c!.width / 2))).toBeLessThan(2);
    expect(Math.abs(b!.y + b!.height - (c!.y + c!.height))).toBeLessThan(2);
    const logo = card.locator("img[alt]:not([alt=''])").first();
    if (await logo.count()) {
      const l = await logo.boundingBox();
      if (l) expect(l.y + l.height).toBeLessThanOrEqual(b!.y + 0.5);
    }

    const { violations } = await new AxeBuilder({ page })
      .include("section[aria-labelledby^='row-']")
      .withRules(["color-contrast"])
      .analyze();
    expect(violations.map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);

    await card.scrollIntoViewIfNeeded();
    // Nothing hovered or focused: the photograph is the row at rest (no hover card on top).
    await page.mouse.move(1, 1);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(600);
    const section = badge.locator("xpath=ancestor::section[1]");
    // Mid-screen, clear of the fixed header and the phone tab bar.
    await section.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await card.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "center" }));
    await page.waitForTimeout(300);
    await section.screenshot({ path: `../docs/screenshots/badge-card-${size.width}.png` });
    // The hero: the small pill beside the maturity rating.
    if (places!.hero) {
      await page.goto(`${places!.hero}?translation=${mode}`);
      await expect(page.locator("main span").filter({ hasText: RIBBONS, visible: true }).first()).toBeVisible();
      await page.mouse.move(1, 1);
      await page.waitForTimeout(600);
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.screenshot({ path: `../docs/screenshots/badge-hero-${size.width}.png` });
  });
}
