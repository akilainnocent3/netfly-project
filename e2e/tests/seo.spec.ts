import { expect, signUp, test } from "./helpers";

type LdNode = Record<string, unknown>;

async function jsonLd(page: import("@playwright/test").Page): Promise<LdNode[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((b) => JSON.parse(b) as LdNode);
}

test("the landing page is server-rendered with structured data", async ({ page }) => {
  await page.route("**/*.js", (route) => route.abort()); // what a non-JS crawler sees
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);
  expect(await page.locator('a[href^="/title/"]').count()).toBeGreaterThan(0);
  const graph = (await jsonLd(page)).flatMap((n) => (n["@graph"] as LdNode[]) ?? [n]);
  expect(graph.map((n) => n["@type"])).toEqual(
    expect.arrayContaining(["Organization", "WebSite", "FAQPage"]),
  );
});

test("a public title page is crawlable without signing in", async ({ page }) => {
  await page.route("**/*.js", (route) => route.abort());
  const res = await page.goto("/title/neon-tide");
  expect(res?.status()).toBe(200);
  expect(page.url()).toContain("/title/neon-tide");
  await expect(page.getByRole("heading", { level: 1, name: "Neon Tide" })).toBeVisible();
  await expect(page).toHaveTitle(/Neon Tide/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.{40,}/);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "video.movie");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/title\/neon-tide$/);
  const types = (await jsonLd(page)).map((n) => n["@type"]);
  expect(types).toEqual(expect.arrayContaining(["Movie", "BreadcrumbList"]));
  // One design: the same title view as the app, server-rendered. Play is a real link (the
  // player needs an account: middleware sends crawlers / no-JS visitors to sign in).
  await expect(page.getByRole("link", { name: /^Play/ }).first()).toHaveAttribute("href", "/watch/neon-tide");
  expect(await page.locator('a[href^="/title/"]').count()).toBeGreaterThan(0);
});

test("unknown titles are real 404s", async ({ request }) => {
  const res = await request.get("/title/no-such-title-anywhere", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});

test("robots.txt and sitemap.xml describe the public site", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /browse");
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/title/neon-tide</loc>");
  expect(sitemap).toMatch(/\/genre\/[a-z-]+<\/loc>/);
  expect(sitemap).not.toContain("/browse");
});

test("private pages redirect signed-out visitors; app pages are open but noindex", async ({ request }) => {
  const res = await request.get("/account", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toContain("/login?next=%2Faccount");
  const browse = await request.get("/browse", { maxRedirects: 0 });
  expect(browse.status()).toBe(200);
  expect(browse.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});

test("a public genre page is crawlable, in the app's design", async ({ page }) => {
  await page.route("**/*.js", (route) => route.abort());
  const res = await page.goto("/genre/drama");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: /films & series/ })).toBeVisible();
  expect(await page.locator('a[href^="/title/"]').count()).toBeGreaterThan(0);
  const types = (await jsonLd(page)).map((n) => n["@type"]);
  expect(types).toContain("ItemList");
});

test("signed-in viewers get the app, not the public pages", async ({ page }) => {
  await signUp(page);
  await page.goto("/genre/drama");
  await expect(page).toHaveURL(/\/categories\/drama/);
  await page.goto("/title/neon-tide");
  await expect(page.getByRole("dialog")).toBeVisible();
  const res = await page.request.get("/browse");
  expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
