import "server-only";
import { cookies } from "next/headers";
import type { TranslationMode } from "./types";
import { getPublicConfig } from "./server-config";

const MODES = new Set(["translated", "not_translated", "all"]);

/** Server-side translation mode: the viewer's cookie, else the configured default. */
export async function serverMode(): Promise<TranslationMode> {
  const [jar, config] = await Promise.all([cookies(), getPublicConfig()]);
  const allowAll = config["features.translation_filter_allow_all"] === true;
  const fromCookie = jar.get("netfly_tr")?.value;
  const fallback =
    typeof config["content.default_translation_mode"] === "string"
      ? config["content.default_translation_mode"]
      : "translated";
  for (const mode of [fromCookie, fallback]) {
    if (mode && MODES.has(mode) && (mode !== "all" || allowAll)) return mode as TranslationMode;
  }
  return "translated";
}
