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
  // player needs an account: middleware sends crawlers / no-JS visitors to sign in) — once the
  // title has a playable video; until then (no S3 configured) it says Coming soon.
  const res2 = await page.request.get("/api/v1/titles/neon-tide");
  const { viewer } = (await res2.json()) as { viewer: { play: unknown } | null };
  if (viewer?.play)
    await expect(page.getByRole("link", { name: /^Play/ }).first()).toHaveAttribute("href", "/watch/neon-tide");
  else await expect(page.getByRole("button", { name: "Coming soon" })).toBeDisabled();
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
  await page.goto("/titles");
  await expect(page).toHaveURL(/\/categories$/);
});

const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/** Title paths listed in the sitemap. */
async function sitemapTitles(request: import("@playwright/test").APIRequestContext) {
  const xml = await (await request.get("/sitemap.xml")).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]!).pathname)
    .filter((p) => p.startsWith("/title/"));
}

test.describe("as Googlebot (no cookies, no JavaScript)", () => {
  test.use({ userAgent: GOOGLEBOT, javaScriptEnabled: false, storageState: { cookies: [], origins: [] } });

  test("every title in the sitemap is a complete, indexable page", async ({ page, request }) => {
    const titles = await sitemapTitles(request);
    expect(titles.length).toBeGreaterThan(0);
    for (const path of titles) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname, `${path} must not redirect`).toBe(path);
      expect(res?.headers()["x-robots-tag"] ?? "", path).not.toMatch(/noindex/);
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
      const h1 = page.locator("h1");
      await expect(h1, `${path}: exactly one <h1>`).toHaveCount(1);
      const name = (await h1.textContent())!.trim();
      expect(await page.title(), path).toContain(name);
      expect(await page.locator('link[rel="canonical"]').getAttribute("href"), path).toMatch(
        new RegExp(`^https?://[^/?#]+${path}$`),
      );
      const nodes = await jsonLd(page);
      const item = nodes.find((n) => n["@type"] === "Movie" || n["@type"] === "TVSeries");
      expect(item?.name, `${path}: Movie/TVSeries JSON-LD`).toBe(name);
      for (const prop of ["description", "genre", "dateCreated", "director", "actor"])
        expect(item?.[prop], `${path}: JSON-LD ${prop}`).toBeTruthy();
      // The JSON-LD carries the page's CSP nonce (allowed by the policy), so nothing blocks it.
      const csp = res?.headers()["content-security-policy"] ?? "";
      const nonce = await page.locator('script[type="application/ld+json"]').first().getAttribute("nonce");
      if (nonce) expect(csp).toContain(`'nonce-${nonce}'`);
    }
  });

  test("robots.txt lets crawlers fetch the public pages and icons", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]!);
    for (const path of ["/title/neon-tide", "/genre/drama", "/titles", "/favicon.ico", "/icon.svg", "/apple-icon.png", "/manifest.webmanifest"])
      expect(disallowed.filter((d) => path.startsWith(d)), path).toEqual([]);
  });

  test("icons and the manifest are served with the right types", async ({ request }) => {
    for (const [path, type] of [
      ["/favicon.ico", /image\/(x-icon|vnd\.microsoft\.icon)/],
      ["/icon.svg", /image\/svg\+xml/],
      ["/apple-icon.png", /image\/png/],
      ["/manifest.webmanifest", /application\/manifest\+json/],
    ] as const) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toMatch(type);
    }
  });

  test("drafts are neither in the sitemap nor reachable", async ({ request }) => {
    // seed_demo's Coming Soon titles are scheduled drafts.
    expect(await sitemapTitles(request)).not.toContain("/title/glass-orchard");
    const res = await request.get("/title/glass-orchard", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test("the A–Z catalogue links to every title in the sitemap", async ({ page, request }) => {
    const titles = await sitemapTitles(request);
    const res = await page.goto("/titles");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    expect((await jsonLd(page)).map((n) => n["@type"])).toContain("ItemList");
    const linked = new Set(
      await page.locator('a[href^="/title/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href"))),
    );
    for (const path of titles) expect(linked.has(path), path).toBe(true);
    await page.goto("/");
    await expect(page.locator('a[href="/titles"]').first()).toBeAttached();
  });
});
