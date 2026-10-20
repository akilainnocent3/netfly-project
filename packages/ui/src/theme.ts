export type PublicConfig = Record<string, unknown>;

function hexToRgb(hex: string): [number, number, number] {
  const clean = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "ff2e4d";
  const n = Number.parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Readable foreground (near-black or white) for text placed on `hex`. */
export function contrastOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#0b0b0f" : "#ffffff";
}

export function str(config: PublicConfig, key: string, fallback: string): string {
  const value = config[key];
  return typeof value === "string" && value ? value : fallback;
}

export function num(config: PublicConfig, key: string, fallback: number): number {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function bool(config: PublicConfig, key: string, fallback: boolean): boolean {
  const value = config[key];
  return typeof value === "boolean" ? value : fallback;
}

/** CSS custom properties derived from branding config; applied on <html>. */
export function themeVariables(
  config: PublicConfig,
  accentKey = "branding.accent_color",
): Record<string, string> {
  const accent = str(config, accentKey, "#FF2E4D");
  const [r, g, b] = hexToRgb(accent);
  return {
    "--accent": accent,
    "--accent-rgb": `${r} ${g} ${b}`,
    "--accent-fg": contrastOn(accent),
    "--bg": str(config, "branding.background_color", "#0B0B0F"),
    "--surface": str(config, "branding.surface_color", "#16161D"),
    "--text": str(config, "branding.text_color", "#F4F4F6"),
  };
}
