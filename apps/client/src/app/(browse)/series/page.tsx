import type { Metadata } from "next";
import { HomeFeed } from "@/components/browse/home-feed";
import { serverBillboard } from "@/lib/server-billboard";

export const metadata: Metadata = { title: "Series" };

export default async function SeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ translation?: string }>;
}) {
  const { translation } = await searchParams;
  return (
    <HomeFeed
      kind="series"
      initialBillboard={await serverBillboard(translation, "series")}
      heading="Series"
    />
  );
}
