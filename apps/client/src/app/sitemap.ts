import type { MetadataRoute } from "next";
import { getPublicConfig } from "@/lib/server-config";
import { imageUrl, indexingEnabled, publicCatalog, publicSitemap, siteUrl } from "@/lib/seo";

/** Landing, A–Z, genre and title pages: everything a signed-out visitor (or crawler) can open. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = await getPublicConfig();
  if (!indexingEnabled(config)) return [];
  const [site, data, catalog] = await Promise.all([
    siteUrl(config),
    publicSitemap(),
    publicCatalog(),
  ]);
  const latest = data?.titles.reduce<string | undefined>(
    (max, t) => (!max || t.updated_at > max ? t.updated_at : max),
    undefined,
  );
  return [
    { url: `${site}/`, lastModified: latest, changeFrequency: "daily", priority: 1 },
    // The A–Z catalogue (every page of it): each title is linked from here.
    ...Array.from({ length: catalog?.pages ?? 1 }, (_, i) => ({
      url: i ? `${site}/titles?page=${i + 1}` : `${site}/titles`,
      lastModified: latest,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...(data?.genres ?? []).map((g) => ({
      url: `${site}/genre/${g.slug}`,
      lastModified: g.updated_at ?? undefined,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...(data?.titles ?? []).map((t) => {
      const image = imageUrl(site, t.image, 1280);
      return {
        url: `${site}/title/${t.slug}`,
        lastModified: t.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.8,
        ...(image ? { images: [image] } : {}),
      };
    }),
    { url: `${site}/legal/terms`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${site}/legal/privacy`, changeFrequency: "yearly", priority: 0.1 },
  ];
}
