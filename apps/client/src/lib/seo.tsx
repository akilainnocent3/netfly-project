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
export const publicSitemap = () => get<Schemas["Sitemap"]>("/api/v1/public/sitemap", 600);
export const publicTitle = (slug: string, mode?: string) =>
  get<TitlePage>(
    `/api/v1/titles/${encodeURIComponent(slug)}${mode ? `?translation=${encodeURIComponent(mode)}` : ""}`,
  );
export const publicEpisodes = (slug: string, season: number) =>
  get<Schemas["EpisodePage"]>(
    `/api/v1/titles/${encodeURIComponent(slug)}/seasons/${season}/episodes?limit=50`,
  );
export const publicGenre = (slug: string) =>
  get<Schemas["HomePage"]>(`/api/v1/genres/${encodeURIComponent(slug)}/titles?sort=suggested`);
