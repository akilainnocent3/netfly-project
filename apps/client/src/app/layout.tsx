import { themeVariables } from "@netfly/ui";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { preconnect } from "react-dom";
import { IntroSplash } from "@/components/brand/intro-splash";
import { Providers } from "@/components/providers";
import { fontFor, fontVariables } from "@/lib/fonts";
import {
  DEFAULT_INTRO_1080,
  DEFAULT_INTRO_720,
  introBootScript,
  type AppOpenFrequency,
} from "@/lib/intro";
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
    icons: {
      icon:
        typeof favicon === "string" && favicon
          ? [{ url: favicon }]
          : [
              { url: "/brand/netfly-app-icon.v1.svg", type: "image/svg+xml" },
              { url: "/brand/favicon-32.v1.png", sizes: "32x32", type: "image/png" },
            ],
      apple: [{ url: "/brand/apple-touch-icon.v1.png", sizes: "180x180" }],
    },
    manifest: "/manifest.webmanifest",
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
    // Android: the on-screen keyboard resizes the layout, so sticky step buttons stay above it.
    interactiveWidget: "resizes-content",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page dynamic, so Next can stamp the CSP nonce
  // (set by middleware) onto its inline scripts.
  const [config, requestHeaders] = await Promise.all([getPublicConfig(), headers()]);
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
  const str = (key: string, fallback: string) =>
    typeof config[key] === "string" && config[key] ? (config[key] as string) : fallback;
  // Decides the app-open splash before first paint (no flash of the page underneath).
  const introBoot = introBootScript({
    enabled: config["intro.enabled"] !== false,
    onAppOpen: config["intro.on_app_open"] !== false,
    frequency: str("intro.app_open_frequency", "once_per_session") as AppOpenFrequency,
    url1080: str("intro.video_url_1080", DEFAULT_INTRO_1080),
    url720: str("intro.video_url_720", DEFAULT_INTRO_720),
  });
  return (
    <html lang="en" className={fontVariables} style={style} suppressHydrationWarning>
      <head>
        <script
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          dangerouslySetInnerHTML={{ __html: introBoot }}
        />
      </head>
      <body className="bg-bg text-fg font-sans">
        <Providers config={config}>
          <IntroSplash />
          {children}
        </Providers>
      </body>
    </html>
  );
}
