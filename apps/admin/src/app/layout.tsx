import { themeVariables } from "@netfly/ui";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import { THEME_SCRIPT } from "@/components/providers/theme";
import { getPublicConfig } from "@/lib/server-config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  const name =
    typeof config["branding.site_name"] === "string" ? config["branding.site_name"] : "NETFLY";
  return {
    title: { default: `${name} Studio`, template: `%s · ${name} Studio` },
    robots: { index: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [config, nonce] = await Promise.all([
    getPublicConfig(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
  ]);
  const vars = themeVariables(config, "branding.admin_accent_color");
  const style = {
    "--accent": vars["--accent"],
    "--accent-rgb": vars["--accent-rgb"],
    "--accent-fg": vars["--accent-fg"],
    // The brand mark keeps the viewer brand colour, not the studio accent.
    "--nf-mark": themeVariables(config)["--accent"],
  } as React.CSSProperties;
  return (
    <html lang="en" className={inter.variable} style={style} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="bg-bg text-fg font-sans">
        <Providers config={config}>{children}</Providers>
      </body>
    </html>
  );
}
