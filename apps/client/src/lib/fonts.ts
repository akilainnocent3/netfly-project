import {
  DM_Sans,
  Inter,
  Inter_Tight,
  Manrope,
  Outfit,
  Plus_Jakarta_Sans,
  Roboto,
} from "next/font/google";

// next/font self-hosts the files and generates size-adjusted fallbacks (no layout shift on swap).
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
  adjustFontFallback: true,
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-roboto",
  display: "swap",
  preload: false,
});
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  preload: false,
});
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  preload: false,
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  preload: false,
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dmsans",
  display: "swap",
  preload: false,
});

export const fontVariables = [interTight, inter, roboto, manrope, outfit, jakarta, dmSans]
  .map((f) => f.variable)
  .join(" ");

const FONT_VAR: Record<string, string> = {
  "Inter Tight": "var(--font-inter-tight)",
  Inter: "var(--font-inter)",
  Roboto: "var(--font-roboto)",
  Manrope: "var(--font-manrope)",
  Outfit: "var(--font-outfit)",
  "Plus Jakarta Sans": "var(--font-jakarta)",
  "DM Sans": "var(--font-dmsans)",
};

export function fontFor(name: string): string {
  return FONT_VAR[name] ?? FONT_VAR["Inter Tight"]!;
}
