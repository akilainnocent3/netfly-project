import { DM_Sans, Inter, Manrope, Outfit, Plus_Jakarta_Sans } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", preload: false });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap", preload: false });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dmsans", display: "swap", preload: false });

export const fontVariables = [inter, manrope, outfit, jakarta, dmSans].map((f) => f.variable).join(" ");

const FONT_VAR: Record<string, string> = {
  Inter: "var(--font-inter)",
  Manrope: "var(--font-manrope)",
  Outfit: "var(--font-outfit)",
  "Plus Jakarta Sans": "var(--font-jakarta)",
  "DM Sans": "var(--font-dmsans)",
};

export function fontFor(name: string): string {
  return FONT_VAR[name] ?? FONT_VAR.Inter!;
}
