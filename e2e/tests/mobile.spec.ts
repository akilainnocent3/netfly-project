import type { Locator, Page } from "@playwright/test";
import { createAccount, expect, signUp, submitSignIn, test } from "./helpers";

// Runs on phone and tablet profiles (playwright.config.ts: Pixel 7, iPhone 13, iPad Mini, 320 px).
const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";

async function signIn(page: Page) {
  const username = await createAccount();
  await page.goto("/login");
  await submitSignIn(page, username);
  await page.waitForURL("**/browse**");
}

/** Screenshot name: the project (device) plus what's shown. */
function shot(name: string) {
  return `../docs/screenshots/mobile-${test.info().project.name.replace(/^mobile-?/, "") || "pixel7"}-${name}.png`;
}

/** The page's own tab bar (the title modal renders a second one inside its dialog). */
const pageTabBar = (page: Page) => page.locator('nav[data-tabbar=""]');

async function expectAtViewportBottom(page: Page, bar: Locator) {
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  const height = await page.evaluate(() => window.innerHeight);
  expect(Math.abs(box.y + box.height - height)).toBeLessThanOrEqual(1);
}

async function expectNoHorizontalScroll(page: Page) {
  // Polled: some routes redirect on the client (e.g. /signup → its first step).
  await expect
    .poll(
      async () => {
        try {
          return await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
        } catch {
          return Number.POSITIVE_INFINITY;
        }
      },
      { message: `horizontal overflow on ${page.url()}` },
    )
    .toBeLessThanOrEqual(0);
}

/** After scrolling to the end, nothing in the page content ends below the tab bar's top edge. */
async function expectEndClearsTabBar(page: Page) {
  // Keep going until the page stops growing (rows load in as they near the viewport).
  let height = 0;
  for (let i = 0; i < 12; i++) {
    const h = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return document.documentElement.scrollHeight;
    });
    if (h === height) break;
    height = h;
    await page.waitForTimeout(500);
  }
  const { lastBottom, barTop, what } = await page.evaluate(() => {
    const bar = document.querySelector('nav[data-tabbar=""]')!.getBoundingClientRect();
    let lastBottom = 0;
    let what = "";
    for (const el of document.querySelectorAll<HTMLElement>(
      "#content a, #content button, #content h1, #content h2, #content h3, #content p, #content img, #content li",
    )) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (
        !r.width ||
        !r.height ||
        style.visibility === "hidden" ||
        el.closest("[aria-hidden=true]")
      )
        continue;
      if (r.bottom > lastBottom) [lastBottom, what] = [r.bottom, el.outerHTML.slice(0, 120)];
    }
    return { lastBottom, barTop: bar.top, what };
  });
  expect(lastBottom, `${what} hidden behind the tab bar on ${page.url()}`).toBeLessThanOrEqual(
    barTop + 0.5,
  );
}

test("phone layout: tab bar and compact switcher", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 640, "Phones only (the compact switcher).");
  await signUp(page);
  await expect(page.getByRole("navigation", { name: "Primary" }).last()).toBeVisible();
  await expect(page.getByRole("radio", { name: "Original" })).toBeVisible();
  await page.getByRole("link", { name: "Categories" }).last().click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
});

test("home: the first row starts below the phone hero's buttons, never over them", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "Phones only (the poster hero).");
  await signIn(page);
  const heading = page.getByRole("heading", { level: 2 }).filter({ hasText: /\S/ }).first();
  const myList = page
    .locator("section[aria-label=Featured]")
    .getByRole("button", { name: /My List/ })
    .last();
  await expect(myList).toBeVisible();
  await expect(heading).toBeVisible();
  const buttons = (await myList.boundingBox())!;
  const row = (await heading.boundingBox())!;
  expect(row.y).toBeGreaterThanOrEqual(buttons.y + buttons.height);
  // Every header control fits on screen, down to 320 px.
  const overflow = await page.evaluate(() => {
    const controls = document.querySelectorAll("header a, header button, header [role=radiogroup]");
    return Math.max(...[...controls].map((el) => el.getBoundingClientRect().right)) - innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test("tapping a tab shows the logo loader in its place until the page has loaded; a second tap is ignored", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, "The tab bar is below lg.");
  await signIn(page);
  // Hold the My List page's server render so the navigation stays pending.
  await page.route("**/my-list**", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.fallback();
  });
  const tab = pageTabBar(page).getByRole("link", { name: "My List" });
  await tab.click();
  await expect(tab.locator(".nf-pending[data-pending] .nf-loader")).toBeVisible();
  // Busy: the link takes no more taps until its page arrives.
  expect(await tab.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await page.waitForTimeout(900); // let the ribbon finish drawing on for the screenshot
  await page.screenshot({ path: shot("tab-loading") });
  await page.waitForURL(/\/my-list/);
  await expect(tab.locator(".nf-pending[data-pending]")).toHaveCount(0);
  await expect(tab).toHaveAttribute("aria-current", "page");
});

test("account: a form's actions are a banner below its fields that docks above the tab bar", async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, "The docked banner is a phone layout.");
  await signIn(page);
  await page.goto("/account");
  const name = page.getByLabel("Full name");
  await name.fill("Banner Check");
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeVisible();
  const measure = () =>
    page.evaluate(() => {
      const form = document.querySelector("input[name=name]")!.closest("form")!;
      const field = form.firstElementChild!.getBoundingClientRect();
      const banner = form.lastElementChild!.getBoundingClientRect();
      const bar = document.querySelector('nav[data-tabbar=""]')!.getBoundingClientRect();
      return {
        fieldBottom: field.bottom,
        bannerTop: banner.top,
        bannerBottom: banner.bottom,
        barTop: bar.top,
      };
    });
  // In place: below the field, never over it.
  await page
    .getByRole("heading", { name: "Profile", exact: true })
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  let m = await measure();
  expect(m.bannerTop).toBeGreaterThanOrEqual(m.fieldBottom);
  // The banner's own spot just under the tab bar's top edge: it docks right above the bar instead.
  await name.evaluate((el) => {
    const top = el.getBoundingClientRect().top + scrollY;
    scrollTo(0, top - innerHeight + 210);
  });
  m = await measure();
  expect(Math.abs(m.bannerBottom - m.barTop)).toBeLessThanOrEqual(1);
  await expect(save).toBeInViewport();
});

test("phone search: Top Searches list, then a 3-column poster grid while typing", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "mobile",
    "Layout-specific: covered on the Pixel 7 profile.",
  );
  await signUp(page);
  await page.goto("/search");
  const input = page.getByRole("searchbox", { name: "Search" });
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("placeholder", "Search shows, movies…");
  const top = page.getByTestId("top-searches");
  await expect(top.getByRole("listitem").first()).toBeVisible();
  await expect(top.getByRole("link", { name: /^Play / }).first()).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/search-mobile-top.png" });

  await input.fill("neon");
  await expect(page.getByRole("heading", { name: "Movies & Series" })).toBeVisible();
  await expect(page).toHaveURL(/\/search\?(.*&)?q=neon/);
  const grid = page.getByTestId("search-results").getByRole("list").first();
  await expect(grid).toHaveCSS("grid-template-columns", /^\S+ \S+ \S+$/);
  await page.screenshot({ path: "../docs/screenshots/search-mobile.png" });

  // Tapping a Top Search opens the title.
  await input.fill("");
  await top.getByRole("listitem").first().getByRole("link").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("tab bar: on every signed-in route, at the viewport bottom, never covering the end of the page", async ({
  page,
}) => {
  test.setTimeout(240_000); // 13 routes, each loaded and scrolled to the end
  await signIn(page);
  const genre = await page.evaluate(async () => {
    const res = await fetch("/api/v1/genres");
    const list = (await res.json()) as Array<{ slug: string }>;
    return list[0]?.slug ?? "drama";
  });
  for (const route of [
    "/browse",
    "/series",
    "/films",
    "/new-and-popular",
    "/my-list",
    "/categories",
    `/categories/${genre}`,
    "/search",
    "/search?q=neon",
    "/account",
    "/account/membership",
    "/account/usage",
    "/account/security",
  ]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await expectAtViewportBottom(page, pageTabBar(page));
    await expectNoHorizontalScroll(page);
    await expectEndClearsTabBar(page);
    // `position: fixed` still means the viewport after scrolling to the end (no transformed ancestor).
    await expectAtViewportBottom(page, pageTabBar(page));
    if (route === "/browse") await page.screenshot({ path: shot("home-end") });
  }
});

test("title modal: stops above the tab bar; every tab still navigates; Escape and back close it", async ({
  page,
}) => {
  test.setTimeout(180_000); // seven modal round trips
  await signIn(page);
  const tabs: Array<[string, RegExp]> = [
    ["Home", /\/browse/],
    ["New & Hot", /\/new-and-popular/],
    ["Search", /\/search/],
    ["My List", /\/my-list/],
    ["Profile", /\/account/],
  ];
  const openTitle = async () => {
    await page.goto("/browse");
    await page.locator('#content a[href^="/title/"]:visible').first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  };

  for (const [label, url] of tabs) {
    const dialog = await openTitle();
    const bar = dialog.getByRole("navigation", { name: "Primary" });
    await expectAtViewportBottom(page, bar);
    // The modal ends where the tab bar begins.
    const [content, barBox] = [(await dialog.boundingBox())!, (await bar.boundingBox())!];
    expect(Math.abs(content.y + content.height - barBox.y)).toBeLessThanOrEqual(1);
    if (label === "Home") await page.screenshot({ path: shot("title-modal") });
    await bar.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  await openTitle();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(/\/browse/);

  // Android back (history back) closes it too.
  await openTitle();
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(/\/browse/);
});

test("on-screen keyboard: the tab bar gets out of the way while typing", async ({ page }) => {
  await signIn(page);
  await page.goto("/search");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /interactive-widget=resizes-content/,
  );
  const bar = pageTabBar(page);
  await expect(bar).toBeVisible();
  const input = page.getByRole("searchbox", { name: "Search" });
  await input.focus();
  // With interactive-widget=resizes-content, Android shrinks the layout viewport for the keyboard.
  // (Emulation also reports that as the screen size, so keep it portrait: a real keyboard never
  // rotates the screen.)
  const size = page.viewportSize()!;
  await page.setViewportSize({
    width: size.width,
    height: Math.max(size.width + 1, size.height - 320),
  });
  await expect(bar).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-keyboard", "");
  await page.setViewportSize(size);
  await expect(bar).toBeVisible();
  // Focus alone (no keyboard on screen) leaves it in place.
  await expect(input).toBeFocused();
  await expect(bar).toBeVisible();
});

test("nested pages have a back chevron: history back, else the parent page", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) >= 768,
    "Phones only (md and up show the full header).",
  );
  await signIn(page);
  await page.goto("/categories");
  await page.locator('#content a[href^="/categories/"]').first().click();
  await page.waitForURL(/\/categories\/[^/]+/);
  const back = page.getByRole("button", { name: "Back" });
  const box = (await back.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(page).toHaveURL(/\/categories(\?|$)/);

  // No history (a direct visit): the parent route. (Retried: a tap before hydration does nothing.)
  await page.goto("/account/usage");
  await expect(async () => {
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/account(\?|$)/, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.goto("/legal/terms");
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
});

/** Interactive elements on screen smaller than 44 × 44 (inline text links excepted). */
async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>(
      "a, button, input, select, [role=button], [role=radio], [role=tab], [role=switch]",
    )) {
      const cs = getComputedStyle(el);
      // A checkbox or radio is tapped through its label.
      const label = /^(checkbox|radio)$/.test((el as HTMLInputElement).type)
        ? el.closest("label")
        : null;
      const r = (label ?? el).getBoundingClientRect();
      if (!r.width || !r.height || cs.visibility === "hidden") continue;
      if (el.closest("[aria-hidden=true], [inert]") || r.top > innerHeight * 3) continue;
      if (el.tagName === "A" && cs.display === "inline") continue;
      if (r.width < 44 || r.height < 44) {
        const name = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30);
        out.add(`${el.tagName} ${Math.round(r.width)}×${Math.round(r.height)} "${name}"`);
      }
    }
    return [...out];
  });
}

test("tap targets are at least 44 × 44 on the main phone pages", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 0) >= 768,
    "Phones (touch targets of the phone layout).",
  );
  await signIn(page);
  for (const route of [
    "/browse",
    "/search",
    "/categories",
    "/account",
    "/my-list",
    "/new-and-popular",
  ]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    expect(await smallTapTargets(page), route).toEqual([]);
  }
});

test("landscape: no horizontal scroll; the tab bar stays at the bottom below lg", async ({
  page,
}) => {
  await signIn(page);
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width: height, height: width });
  for (const route of ["/browse", "/search?q=neon", "/categories", "/account", "/legal/terms"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
    if (height < 1024 && !route.startsWith("/legal"))
      await expectAtViewportBottom(page, pageTabBar(page));
  }
  await page.goto("/browse");
  await page.screenshot({ path: shot("landscape") });
});

test("public pages: no horizontal scroll at any phone width", async ({ page }) => {
  for (const route of [
    "/",
    "/login",
    "/signup",
    "/legal/terms",
    "/browse",
    "/title/neon-tide",
    "/search",
  ]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
  }
});

test("Studio: the phone tab bar and More sheet reach every section", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "Studio shows its sidebar from md up.");
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Username").fill(process.env.NETFLY_ADMIN_USER ?? "admin");
  await page.getByLabel("Password").fill(process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  const bar = page.locator("nav[data-tabbar]");
  await expectAtViewportBottom(page, bar);
  await page.screenshot({ path: shot("studio") });
  for (const path of ["/", "/titles", "/users", "/settings"]) {
    await page.goto(`${ADMIN}${path}`);
    await page.waitForLoadState("networkidle");
    expect(await smallTapTargets(page), `Studio ${path}`).toEqual([]);
  }
  await page.goto(`${ADMIN}/`);
  for (const [label, path] of [
    ["Titles", "/titles"],
    ["Jobs", "/transcoding"],
    ["Users", "/users"],
    ["Dashboard", "/"],
  ] as const) {
    await bar.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path}`));
    await expectNoHorizontalScroll(page);
  }

  await bar.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: "All sections" });
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: shot("studio-more") });
  const hrefs = await sheet
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  expect(hrefs).toEqual(
    expect.arrayContaining([
      "/",
      "/titles",
      "/categories",
      "/home-layout",
      "/transcoding",
      "/plans",
      "/subscribers",
      "/users",
      "/staff",
      "/settings",
      "/audit",
    ]),
  );
  await page.keyboard.press("Escape");
  for (const href of hrefs.filter((h) => h !== "/")) {
    await bar.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "All sections" }).locator(`a[href="${href}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("dialog", { name: "All sections" })).toBeHidden();
    await expectNoHorizontalScroll(page);
    await expectAtViewportBottom(page, bar);
  }
});
