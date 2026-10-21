import type { BillboardItem, TranslationMode } from "./types";
import { serverMode } from "./server-mode";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

/** Anonymous billboard (it's the LCP, so it's server-rendered); personal rows load client-side. */
export async function serverBillboard(
  translation: string | undefined,
  kind?: "movie" | "series",
): Promise<{ mode: TranslationMode; items: BillboardItem[] } | undefined> {
  const cookieMode = await serverMode();
  const mode: TranslationMode =
    translation === "not_translated" || translation === "translated" || translation === "all"
      ? translation
      : cookieMode;
  try {
    const res = await fetch(
      `${API}/api/v1/browse/billboard?translation=${mode}${kind ? `&type=${kind}` : ""}`,
      { next: { revalidate: 30 } },
    );
    return res.ok ? { mode, items: (await res.json()) as BillboardItem[] } : undefined;
  } catch {
    return undefined;
  }
}
