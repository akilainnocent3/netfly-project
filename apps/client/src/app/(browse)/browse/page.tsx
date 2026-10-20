import type { Metadata } from "next";
import { HomeFeed } from "@/components/browse/home-feed";
import type { BillboardItem } from "@/lib/types";
import { serverMode } from "@/lib/server-mode";

export const metadata: Metadata = { title: "Home" };

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

async function billboard(mode: string): Promise<BillboardItem[] | undefined> {
  try {
    const res = await fetch(`${API}/api/v1/browse/billboard?translation=${mode}`, {
      next: { revalidate: 30 },
    });
    return res.ok ? ((await res.json()) as BillboardItem[]) : undefined;
  } catch {
    return undefined;
  }
}

/** The hero is server-rendered (it's the LCP); personal rows load client-side with skeletons. */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ translation?: string }>;
}) {
  const [{ translation }, cookieMode] = await Promise.all([searchParams, serverMode()]);
  const mode =
    translation === "not_translated" || translation === "translated" || translation === "all"
      ? translation
      : cookieMode;
  const items = await billboard(mode);
  return <HomeFeed initialBillboard={items ? { mode, items } : undefined} />;
}
