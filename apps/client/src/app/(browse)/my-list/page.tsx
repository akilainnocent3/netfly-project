"use client";

import Link from "next/link";
import { GridSkeleton, PageShell, TitleGrid } from "@/components/browse/title-grid";
import { StateMessage } from "@/components/ui/state-message";
import { useMyList } from "@/lib/queries";

export default function MyListPage() {
  const list = useMyList();
  return (
    <PageShell
      title="My List"
      subtitle={list.data?.length ? `${list.data.length} saved` : undefined}
    >
      {list.isPending ? (
        <GridSkeleton count={6} />
      ) : list.data?.length ? (
        <TitleGrid items={list.data} />
      ) : (
        <StateMessage title="Your list is empty">
          Tap <span className="font-semibold text-white">+</span> on anything you want to watch
          later.{" "}
          <Link href="/browse" className="text-white underline">
            Browse titles
          </Link>
        </StateMessage>
      )}
    </PageShell>
  );
}
