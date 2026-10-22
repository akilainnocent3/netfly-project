import type { MetadataRoute } from "next";
import { siteName } from "@/lib/seo";
import { getPublicConfig } from "@/lib/server-config";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const config = await getPublicConfig();
  const name = siteName(config);
  return {
    name,
    short_name: name,
    description: typeof config["branding.tagline"] === "string" ? config["branding.tagline"] : "",
    start_url: "/browse",
    display: "standalone",
    background_color: "#141414",
    theme_color: "#141414",
    icons: [
      { src: "/brand/icon-192.v2.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.v2.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/icon-maskable-192.v2.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/icon-maskable-512.v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
