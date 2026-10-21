import { themeVariables } from "@netfly/ui";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { preconnect } from "react-dom";
import { Providers } from "@/components/providers";
import { fontFor, fontVariables } from "@/lib/fonts";
import { indexingEnabled, siteName, siteUrl } from "@/lib/seo";
import { getPublicConfig } from "@/lib/server-config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  const name = siteName(config);
  const tagline = typeof config["branding.tagline"] === "string" ? config["branding.tagline"] : "";
  const favicon = config["branding.favicon_url"];
  const index = indexingEnabled(config);
  return {
    metadataBase: new URL(await siteUrl(config)),
    title: { default: name, template: `%s · ${name}` },
    description: tagline,
    applicationName: name,
    icons: typeof favicon === "string" && favicon ? [{ url: favicon }] : undefined,
    robots: { index, follow: index },
    openGraph: { siteName: name, type: "website", locale: "en" },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const config = await getPublicConfig();
  const bg =
    typeof config["branding.background_color"] === "string"
      ? config["branding.background_color"]
      : "#141414";
  return {
    themeColor: bg,
    colorScheme: "dark",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page dynamic, so Next can stamp the CSP nonce
  // (set by middleware) onto its inline scripts.
  const [config] = await Promise.all([getPublicConfig(), headers()]);
  const font =
    typeof config["branding.font_family"] === "string"
      ? config["branding.font_family"]
      : "Inter Tight";
  // Images and video redirect to the S3/CDN origin: warm that connection before the hero asks.
  const media = Array.isArray(config["media_origins"]) ? config["media_origins"] : [];
  for (const origin of media.slice(0, 2)) {
    if (typeof origin === "string" && origin.startsWith("https://")) preconnect(origin);
  }
  const style = { ...themeVariables(config), "--brand-font": fontFor(font) } as React.CSSProperties;
  return (
    <html lang="en" className={fontVariables} style={style} suppressHydrationWarning>
      <body className="bg-bg text-fg font-sans">
        <Providers config={config}>{children}</Providers>
      </body>
    </html>
  );
}
