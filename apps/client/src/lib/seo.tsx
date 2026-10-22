import "server-only";
import type { PublicConfig } from "@netfly/ui";
import { cookies, headers } from "next/headers";
import type { Schemas } from "@netfly/api-client";
import type { TitlePage } from "./types";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

/** Same signal the middleware uses: the CSRF cookie only exists while a session does. */
export const SESSION_COOKIE = "netfly_csrf_client";

export async function isSignedIn(): Promise<boolean> {
  return (await cookies()).has(SESSION_COOKIE);
}

export function indexingEnabled(config: PublicConfig): boolean {
  return config["seo.indexing_enabled"] !== false;
}

export function siteName(config: PublicConfig): string {
  const name = config["branding.site_name"];
  return typeof name === "string" && name ? name : "NETFLY";
}

/** Canonical origin: `seo.site_url` when set (recommended in production), else the request host. */
export async function siteUrl(config: PublicConfig): Promise<string> {
  const configured = config["seo.site_url"];
  if (typeof configured === "string" && configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Trim text to `max` characters at a word boundary (with an ellipsis when cut). */
export function clip(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean
    .slice(0, max - 1)
    .replace(/\s+\S*$/, "")
    .replace(/[\s,;:.–—-]+$/, "")}…`;
}

/**
 * A title page's <title>: "Watch {Title} ({Year}) | {Type} | {Site}", at most `max` characters.
 * When it's too long the least useful parts go first: the type, then the year, then "Watch";
 * a name that still doesn't fit is clipped.
 */
export function titleTag(
  t: { title: string; year?: number | null; type: string },
  site: string,
  max = 60,
): string {
  const type = t.type === "series" ? "TV Series" : "Movie";
  const year = t.year ? ` (${t.year})` : "";
  const candidates = [
    `Watch ${t.title}${year} | ${type} | ${site}`,
    `Watch ${t.title}${year} | ${site}`,
    `Watch ${t.title} | ${site}`,
    `${t.title} | ${site}`,
  ];
  const fit = candidates.find((c) => c.length <= max);
  return fit ?? `${clip(t.title, max - site.length - 3)} | ${site}`;
}

/** Absolute URL of a pre-rendered image (the API redirects to the CDN; crawlers follow it). */
export function imageUrl(site: string, key: string | undefined | null, width = 1280) {
  return key ? `${site}/api/v1/img/${key}/w${width}` : undefined;
}

/** Inline JSON-LD. Data blocks never execute, but the nonce keeps strict CSP reports quiet. */
export async function JsonLd({ data }: { data: object }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // `<` is escaped so catalog text can never close the script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

async function get<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export const publicLanding = () => get<Schemas["Landing"]>("/api/v1/public/landing");
// Not cached here: the API caches both under the catalog version, so a title published a moment
// ago is already in the sitemap and the A–Z list.
export const publicSitemap = () => get<Schemas["Sitemap"]>("/api/v1/public/sitemap", 0);
export const publicCatalog = (page = 1) =>
  get<Schemas["Catalog"]>(`/api/v1/public/catalog?page=${page}`, 0);
export const publicTitle = (slug: string, mode?: string) =>
  get<TitlePage>(
    `/api/v1/titles/${encodeURIComponent(slug)}${mode ? `?translation=${encodeURIComponent(mode)}` : ""}`,
  );
export const publicEpisodes = (slug: string, season: number) =>
  get<Schemas["EpisodePage"]>(
    `/api/v1/titles/${encodeURIComponent(slug)}/seasons/${season}/episodes?limit=50`,
  );
/**
 * A genre's titles in both translation modes (the API serves one mode per request, and "all" is a
 * feature flag): the sitemap lists a genre when it has any published title, so its public page
 * must show them all.
 */
export async function publicGenre(slug: string): Promise<Schemas["HomePage"] | null> {
  const path = `/api/v1/genres/${encodeURIComponent(slug)}/titles?sort=suggested&translation=`;
  const pages = await Promise.all(
    ["translated", "not_translated"].map((mode) => get<Schemas["HomePage"]>(path + mode)),
  );
  const base = pages.find((p) => p?.rows[0]) ?? pages.find(Boolean);
  if (!base) return null;
  const row = base.rows[0];
  if (!row) return base;
  const seen = new Set<number>();
  const items = pages
    .flatMap((p) => p?.rows[0]?.items ?? [])
    .filter((t) => !seen.has(t.id) && seen.add(t.id));
  return { ...base, rows: [{ ...row, items }] };
}
