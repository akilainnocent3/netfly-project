import type { MetadataRoute } from "next";
import { getPublicConfig } from "@/lib/server-config";
import { PRIVATE_PATHS } from "@/lib/routes";
import { indexingEnabled, siteUrl } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const config = await getPublicConfig();
  const site = await siteUrl(config);
  if (!indexingEnabled(config)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      // Images are served via /api/v1/img (redirect to the CDN); the rest of the API is private.
      allow: ["/", "/api/v1/img/"],
      disallow: [...PRIVATE_PATHS, "/api/"],
    },
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
