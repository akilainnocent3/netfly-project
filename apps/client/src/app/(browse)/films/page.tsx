import type { Metadata } from "next";
import { HomeFeed } from "@/components/browse/home-feed";
import { serverBillboard } from "@/lib/server-billboard";

export const metadata: Metadata = { title: "Films" };

export default async function FilmsPage({
  searchParams,
}: {
  searchParams: Promise<{ translation?: string }>;
}) {
  const { translation } = await searchParams;
  return (
    <HomeFeed
      kind="movie"
      initialBillboard={await serverBillboard(translation, "movie")}
      heading="Films"
    />
  );
}
