"use client";

import { use, useState } from "react";
import { GridSkeleton, PageShell, TitleGrid } from "@/components/browse/title-grid";
import { SegmentedControl } from "@/components/ui/segmented";
import { StateMessage } from "@/components/ui/state-message";
import { useGenreTitles } from "@/lib/queries";

const SORTS = [
  { value: "suggested", label: "Suggested" },
  { value: "newest", label: "Newest" },
  { value: "az", label: "A–Z" },
  { value: "year", label: "Year" },
] as const;

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("suggested");
  const titles = useGenreTitles(slug, sort);
  const items = titles.data?.pages.flatMap((p) => p.rows[0]?.items ?? []) ?? [];
  const genre = titles.data?.pages[0]?.genre;
  const name = genre?.name ?? titles.data?.pages[0]?.rows[0]?.title ?? "";
  return (
    <PageShell
      title={name || " "}
      subtitle={genre?.description || undefined}
      cover={genre ? (genre.artwork ?? genre.sample) : null}
      actions={
        <SegmentedControl
          label="Sort"
          options={[...SORTS]}
          value={sort}
          onChange={setSort}
          size="sm"
          tone="light"
        />
      }
    >
      {titles.isPending ? (
        <GridSkeleton />
      ) : titles.isError ? (
        <StateMessage
          tone="error"
          title="We couldn't load this category"
          action={{ label: "Try again", onClick: () => titles.refetch() }}
        />
      ) : items.length ? (
        <TitleGrid
          items={items}
          dimmed={titles.isPlaceholderData}
          loadingMore={titles.isFetchingNextPage}
          onEnd={() =>
            titles.hasNextPage && !titles.isFetchingNextPage && void titles.fetchNextPage()
          }
        />
      ) : (
        <StateMessage title="Nothing here in this mode">
          Try the other translation filter at the top of the page.
        </StateMessage>
      )}
    </PageShell>
  );
}
