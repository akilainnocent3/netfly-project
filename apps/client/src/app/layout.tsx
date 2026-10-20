import { themeVariables } from "@netfly/ui";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import { fontFor, fontVariables } from "@/lib/fonts";
import { getPublicConfig } from "@/lib/server-config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  const name =
    typeof config["branding.site_name"] === "string" ? config["branding.site_name"] : "NETFLY";
  const tagline = typeof config["branding.tagline"] === "string" ? config["branding.tagline"] : "";
  const favicon = config["branding.favicon_url"];
  return {
    title: { default: name, template: `%s · ${name}` },
    description: tagline,
    icons: typeof favicon === "string" && favicon ? [{ url: favicon }] : undefined,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const config = await getPublicConfig();
  const bg =
    typeof config["branding.background_color"] === "string"
      ? config["branding.background_color"]
      : "#0B0B0F";
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
    typeof config["branding.font_family"] === "string" ? config["branding.font_family"] : "Inter";
  const style = { ...themeVariables(config), "--brand-font": fontFor(font) } as React.CSSProperties;
  return (
    <html lang="en" className={fontVariables} style={style} suppressHydrationWarning>
      <body className="bg-bg text-fg font-sans">
        <Providers config={config}>{children}</Providers>
      </body>
    </html>
  );
}
