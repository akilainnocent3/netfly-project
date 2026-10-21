import type { Metadata } from "next";
import { HomeFeed } from "@/components/browse/home-feed";
import { serverBillboard } from "@/lib/server-billboard";

export const metadata: Metadata = { title: "Home" };

/** The hero is server-rendered (it's the LCP); personal rows load client-side with skeletons. */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ translation?: string }>;
}) {
  const { translation } = await searchParams;
  return <HomeFeed initialBillboard={await serverBillboard(translation)} />;
}
