/**
 * The brand loader in the real app: requests are held open so each loading state stays on
 * screen, then it's checked and photographed at phone and desktop width (docs/screenshots).
 */
import type { Page, Route } from "@playwright/test";
import { createAccount, expect, loaderShown, submitSignIn, test } from "./helpers";

const SIZES = [
  { width: 360, height: 740 },
  { width: 1440, height: 900 },
] as const;

/** Hold matching requests for `ms` before letting them through. */
async function hold(page: Page, match: (url: URL, route: Route) => boolean, ms: number) {
  await page.route("**/*", async (route) => {
    if (match(new URL(route.request().url()), route)) await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}

async function signIn(page: Page) {
  const username = await createAccount();
  await page.goto("/login");
  await submitSignIn(page, username);
  await page.waitForURL("**/browse**");
}

for (const size of SIZES) {
  test.describe(`loader at ${size.width}px`, () => {
    test.use({ viewport: size });
    const shot = (name: string) => `../docs/screenshots/loader-${name}-${size.width}.png`;

    test("a saving button keeps its width and shows the small loader", async ({ page }) => {
      const username = await createAccount();
      await page.goto("/login");
      await hold(page, (u, r) => u.pathname === "/api/v1/auth/login" && r.request().method() === "POST", 2500);
      const button = page.getByRole("button", { name: /^Sign in$/i });
      const width = (await button.boundingBox())!.width;
      await submitSignIn(page, username);
      await loaderShown(button.locator(".nf-loader:has(svg)"));
      await expect(button).toHaveAttribute("aria-busy", "true");
      expect((await button.boundingBox())!.width).toBe(width);
      await page.screenshot({ path: shot("button-saving") });
      await page.waitForURL("**/browse**");
    });

    test("a route change shows the large loader below the header", async ({ page }) => {
      await signIn(page);
      // `next dev` doesn't prefetch, so the client learns about loading.tsx only from the
      // (held) response itself; production builds prefetch the boundary and show it at once.
      const dev = await page.evaluate(() => !!document.querySelector("nextjs-portal"));
      test.skip(dev, "route fallbacks need prefetching, which only production builds do");
      await page.goto("/categories");
      // Hold the navigation's RSC request, not the prefetch (which carries the loading boundary).
      const navigation = (r: Route) => !!r.request().headers()["rsc"] && !r.request().headers()["next-router-prefetch"];
      await hold(page, (u, r) => u.pathname.startsWith("/categories/") && navigation(r), 3000);
      await page.locator('main a[href^="/categories/"]').first().click();
      const loader = page.locator("[aria-busy] > .nf-loader[data-size=lg]:has(svg)");
      await loaderShown(loader);
      await expect(page.locator("header").first()).toBeVisible();
      await page.screenshot({ path: shot("route") });
      await page.waitForURL("**/categories/**");
    });

    test("the player shows the large loader until playback is ready", async ({ page }) => {
      await signIn(page);
      await hold(page, (u) => u.pathname.startsWith("/api/v1/playback/"), 4000);
      await page.goto("/watch/neon-tide");
      await loaderShown(page.locator("main[aria-busy] .nf-loader[data-size=lg]:has(svg)"));
      await page.screenshot({ path: shot("player") });
    });
  });
}

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the loader only pulses: no travelling light, no scaling", async ({ page }) => {
    await signIn(page);
    await hold(page, (u) => u.pathname.startsWith("/api/v1/playback/"), 4000);
    await page.goto("/watch/neon-tide");
    const loader = page.locator(".nf-loader[data-size=lg]:has(.nf-loader__light)");
    await expect(loader).toBeVisible();
    // Polled: the route's server fallback is replaced by the page's own loader as it hydrates.
    await expect
      .poll(() =>
        loader.evaluate((el) => {
          const svg = el.querySelector("svg")!;
          return {
            light: getComputedStyle(el.querySelector(".nf-loader__light")!).display,
            animation: getComputedStyle(svg).animationName,
            transform: getComputedStyle(svg).transform,
          };
        }),
      )
      .toEqual({ light: "none", animation: "nf-pulse", transform: "none" });
  });
});

test.describe("buttons that start a navigation behave like saving buttons", () => {
  /** Disabled (busy) at once; the logo loader shows after its delay; the label stays for its width. */
  async function expectBusy(button: import("@playwright/test").Locator) {
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button.locator(".nf-loader:has(svg)")).toBeVisible();
  }

  test("Get Started (a link) and the sign-up Next button", async ({ page }) => {
    const slow = (prefix: string) =>
      hold(page, (u, r) => u.pathname.startsWith(prefix) && r.request().resourceType() !== "image", 2500);
    await page.goto("/");
    await slow("/signup");
    const start = page.getByRole("link", { name: /Get Started/i }).first();
    await start.click();
    await expectBusy(start);
    await page.waitForURL(/\/signup\/name/);
    await page.unrouteAll({ behavior: "wait" });

    await page.locator("input[name=name]").fill("Loader Check");
    await slow("/signup/username");
    const next = page.getByRole("button", { name: "Next", exact: true });
    await next.click();
    await expectBusy(next);
    await expect(next).toBeDisabled();
    await loaderShown(next.locator(".nf-loader:has(svg)"));
    await page.screenshot({ path: "../docs/screenshots/loader-button-next-1440.png" });
    await page.waitForURL(/\/signup\/username/);
  });

  test("Studio: a button inside a link", async ({ page }) => {
    const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";
    await page.goto(`${ADMIN}/login`);
    await page.getByLabel("Username").fill(process.env.NETFLY_ADMIN_USER ?? "admin");
    await page.getByLabel("Password").fill(process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto(`${ADMIN}/titles`);
    await hold(page, (u) => u.pathname === "/titles/new", 2500);
    const create = page.getByRole("button", { name: /New title/ });
    await create.click();
    await expectBusy(create);
    await page.waitForURL(/\/titles\/new/);
  });
});
