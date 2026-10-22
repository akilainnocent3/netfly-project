// Crawl the running site the way a search engine does and check what it would index.
//   pnpm seo:audit [--base http://localhost:3000] [--query "the rain" --expect /title/the-rain]
//
// Starts from /sitemap.xml with a Googlebot user agent, no cookies and JavaScript off, and checks
// each page: status, <title> and description length, canonical, one <h1>, no noindex, JSON-LD
// (Movie / TVSeries properties on title pages), image URLs, and that the A–Z catalogue (/titles)
// links to every title in the sitemap. Then it builds a small inverted index of the crawled pages
// and runs search queries against it — a demonstration that a page is indexable and matches the
// query, not a prediction of Google's ranking. Prints a table; exits 1 on any failure.
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = (arg("base", process.env.NETFLY_CLIENT_URL ?? "http://localhost:3000")).replace(/\/$/, "");
const GOOGLEBOT =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
// Search simulation: the demo catalog's "The Rain" (seed_demo), plus one cast name.
const QUERIES = [
  ["the rain", "/title/the-rain"],
  ["the rain series", "/title/the-rain"],
  ["Mira Solberg", "/title/the-rain"],
];

const { chromium } = createRequire(new URL("../e2e/package.json", import.meta.url))("@playwright/test");
const browser = await chromium.launch();
const context = await browser.newContext({ userAgent: GOOGLEBOT, javaScriptEnabled: false });
const page = await context.newPage();

const failures = [];
const warnings = [];
const fail = (url, msg) => failures.push(`${url}: ${msg}`);
const warn = (url, msg) => warnings.push(`${url}: ${msg}`);

// ---- sitemap -------------------------------------------------------------------------------
const sitemapRes = await context.request.get(`${BASE}/sitemap.xml`);
if (!sitemapRes.ok()) {
  console.error(`sitemap.xml: HTTP ${sitemapRes.status()}`);
  process.exit(1);
}
const sitemapXml = await sitemapRes.text();
const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
// Sitemap URLs use seo.site_url; crawl the same paths on BASE.
const pathOf = (u) => new URL(u).pathname;
const paths = [...new Set(locs.map(pathOf))];
const titlePaths = paths.filter((p) => p.startsWith("/title/"));

// ---- robots.txt ----------------------------------------------------------------------------
const robots = await (await context.request.get(`${BASE}/robots.txt`)).text();
const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);
// robots.txt rules are path prefixes ("Disallow: /browse" also covers /browse/…).
const blocked = (p) => disallowed.some((d) => d !== "" && p.startsWith(d));
for (const p of ["/", "/titles", "/favicon.ico", "/icon.svg", "/apple-icon.png", "/manifest.webmanifest", ...paths]) {
  if (blocked(p)) fail(p, "blocked by robots.txt");
}
if (/Disallow:\s*\/\s*$/m.test(robots)) fail("/robots.txt", "Disallow: / (seo.indexing_enabled is off)");

// ---- pages ---------------------------------------------------------------------------------
const rows = [];
const documents = [];
const checkedImages = new Map();

async function imageOk(url) {
  if (!checkedImages.has(url)) {
    const res = await context.request.get(url, { maxRedirects: 5 }).catch(() => null);
    checkedImages.set(url, !!res && res.ok() && /^image\//.test(res.headers()["content-type"] ?? ""));
  }
  return checkedImages.get(url);
}

const crawlTargets = [...new Set([...paths, "/titles"])];
for (const p of crawlTargets) {
  const url = `${BASE}${p}`;
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  const status = res?.status() ?? 0;
  const robotsHeader = res?.headers()["x-robots-tag"] ?? "";
  const info = await page.evaluate(() => {
    const meta = (sel) => document.querySelector(sel)?.getAttribute("content") ?? "";
    return {
      finalPath: location.pathname,
      title: document.title,
      description: meta('meta[name="description"]'),
      robots: meta('meta[name="robots"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
      h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()),
      ogImage: meta('meta[property="og:image"]'),
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
      links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
      text: document.body.innerText,
    };
  });
  const content = p.startsWith("/title/") || p.startsWith("/genre/") || p === "/" || p.startsWith("/titles");
  const row = { path: p, status, title: info.title.length, desc: info.description.length, h1: info.h1.length, canonical: "ok", jsonld: "-", result: "ok" };
  const before = failures.length;

  if (status !== 200) fail(p, `HTTP ${status}`);
  if (info.finalPath !== p) fail(p, `redirected to ${info.finalPath}`);
  if (/noindex/i.test(info.robots) || /noindex/i.test(robotsHeader)) fail(p, "noindex");
  if (!info.title) fail(p, "no <title>");
  else if (info.title.length > 60 && content) fail(p, `<title> is ${info.title.length} chars (> 60)`);
  if (content) {
    if (info.description.length < 50 || info.description.length > 160)
      fail(p, `meta description is ${info.description.length} chars (want 50–160)`);
    if (info.h1.length !== 1) fail(p, `${info.h1.length} <h1> elements`);
  }
  try {
    const c = new URL(info.canonical);
    if (c.search) fail(p, `canonical has a query string (${info.canonical})`);
    if (c.pathname !== p) fail(p, `canonical points to ${c.pathname}`);
  } catch {
    row.canonical = "missing";
    fail(p, "canonical missing or not absolute");
  }
  if (info.ogImage && !(await imageOk(info.ogImage))) fail(p, `og:image doesn't resolve (${info.ogImage})`);

  // JSON-LD
  const nodes = [];
  for (const raw of info.ld) {
    try {
      const data = JSON.parse(raw);
      nodes.push(...(data["@graph"] ?? [data]));
    } catch {
      fail(p, "JSON-LD doesn't parse");
    }
  }
  row.jsonld = nodes.map((n) => n["@type"]).join("+") || "none";
  if (p.startsWith("/title/")) {
    const item = nodes.find((n) => n["@type"] === "Movie" || n["@type"] === "TVSeries");
    if (!item) fail(p, "no Movie / TVSeries JSON-LD");
    else {
      if (item.name !== info.h1[0]) fail(p, `JSON-LD name "${item.name}" ≠ <h1> "${info.h1[0]}"`);
      if (!info.title.includes(item.name)) fail(p, "<title> doesn't contain the title name");
      for (const prop of ["description", "genre", "dateCreated", "director", "actor"])
        if (item[prop] === undefined || (Array.isArray(item[prop]) && !item[prop].length))
          fail(p, `JSON-LD ${item["@type"]} lacks ${prop}`);
      if (item["@type"] === "TVSeries") {
        if (!item.numberOfSeasons) fail(p, "TVSeries lacks numberOfSeasons");
        if (!item.containsSeason) warn(p, "no containsSeason (the series has no playable episodes yet)");
      }
      if (!item.image) warn(p, "no image in JSON-LD (the title has no artwork uploaded; Google needs one for rich results)");
      else if (!(await imageOk(item.image))) fail(p, `JSON-LD image doesn't resolve (${item.image})`);
      if (item.aggregateRating && !(item.aggregateRating.ratingCount > 0)) fail(p, "aggregateRating without real ratings");
    }
  }
  if (p === "/") {
    const site = nodes.find((n) => n["@type"] === "WebSite");
    if (!site?.name || !site?.url || !site?.alternateName) fail(p, "WebSite JSON-LD needs name, alternateName and url");
  }
  if (p.startsWith("/titles") && !nodes.some((n) => n["@type"] === "ItemList")) fail(p, "no ItemList JSON-LD");

  row.result = failures.length > before ? "FAIL" : "ok";
  rows.push(row);
  documents.push({ path: p, title: info.title, h1: info.h1.join(" "), description: info.description, text: info.text, links: info.links });
}

// ---- crawl depth: /titles (and its pages) link to every title -------------------------------
const reached = new Set();
const queue = ["/titles"];
const seen = new Set();
while (queue.length) {
  const p = queue.shift();
  if (seen.has(p)) continue;
  seen.add(p);
  let doc = documents.find((d) => d.path === p);
  if (!doc) {
    await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
    doc = { path: p, links: await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"))) };
  }
  for (const href of doc.links ?? []) {
    const u = new URL(href, BASE);
    if (u.origin !== new URL(BASE).origin) continue;
    if (u.pathname.startsWith("/title/")) reached.add(u.pathname);
    if (u.pathname === "/titles" && u.search) queue.push(`/titles${u.search}`);
  }
}
const unreached = titlePaths.filter((p) => !reached.has(p));
for (const p of unreached) fail(p, "not linked from the /titles catalogue");
const landing = documents.find((d) => d.path === "/");
if (landing && !landing.links.some((h) => new URL(h, BASE).pathname === "/titles")) fail("/", "doesn't link to /titles");

// ---- search simulation ---------------------------------------------------------------------
const tokenize = (s) => (s.toLowerCase().normalize("NFKD").match(/[\p{L}\p{N}]+/gu) ?? []);
const FIELDS = { title: 5, h1: 4, description: 2, text: 1 };
const index = new Map(); // term -> Map(path -> weighted tf)
const lengths = new Map();
for (const d of documents) {
  let length = 0;
  for (const [field, weight] of Object.entries(FIELDS)) {
    for (const term of tokenize(d[field] ?? "")) {
      length += 1;
      if (!index.has(term)) index.set(term, new Map());
      const postings = index.get(term);
      postings.set(d.path, (postings.get(d.path) ?? 0) + weight);
    }
  }
  lengths.set(d.path, length);
}
const avgLength = [...lengths.values()].reduce((a, b) => a + b, 0) / Math.max(1, lengths.size);
function search(query) {
  const N = documents.length;
  const scores = new Map();
  const terms = tokenize(query);
  for (const term of terms) {
    const postings = index.get(term);
    if (!postings) continue;
    const idf = Math.log(1 + (N - postings.size + 0.5) / (postings.size + 0.5));
    for (const [path, tf] of postings) {
      const norm = tf / (tf + 1.2 * (0.25 + 0.75 * (lengths.get(path) / avgLength))); // BM25
      scores.set(path, (scores.get(path) ?? 0) + idf * norm * 2.2);
    }
  }
  // Matches in the title or h1 count most: every query word there, more for the exact phrase.
  const phrase = terms.join(" ");
  for (const d of documents) {
    const words = tokenize(`${d.title} ${d.h1}`);
    let boost = 0;
    if (terms.length && terms.every((t) => words.includes(t))) boost += 4;
    if (phrase && words.join(" ").includes(phrase)) boost += 2;
    if (boost) scores.set(d.path, (scores.get(d.path) ?? 0) + boost);
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
}
const searchRows = [];
for (const [query, expected] of QUERIES) {
  const hits = search(query);
  const top = hits[0]?.[0];
  if (top !== expected) fail(`search "${query}"`, `top hit is ${top ?? "nothing"}, expected ${expected}`);
  searchRows.push({ query, top: top ?? "-", score: hits[0]?.[1].toFixed(2) ?? "-", next: hits.slice(1).map((h) => `${h[0]} (${h[1].toFixed(2)})`).join(", "), result: top === expected ? "ok" : "FAIL" });
}

await browser.close();

console.log(`\nSEO audit of ${BASE} — ${crawlTargets.length} pages from sitemap.xml (+ /titles), Googlebot UA, JavaScript off\n`);
console.table(rows);
console.log(`Crawl depth: /titles reaches ${titlePaths.length - unreached.length}/${titlePaths.length} sitemap titles.\n`);
console.log('Search simulation (inverted index over crawled <title>, <h1>, description and visible text; BM25 + title/h1 match boost). Shows indexability and query match, not Google ranking:');
console.table(searchRows);
if (warnings.length) console.log(`Warnings (${warnings.length}):\n  ${warnings.join("\n  ")}\n`);
if (failures.length) {
  console.log(`FAILURES (${failures.length}):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("All checks passed.");
