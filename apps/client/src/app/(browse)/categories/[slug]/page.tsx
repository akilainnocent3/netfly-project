"use client";

import { cn } from "@netfly/ui";
import { use, useState } from "react";
import { GridSkeleton, PageShell, TitleGrid } from "@/components/browse/title-grid";
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
  const name = titles.data?.pages[0]?.rows[0]?.title ?? "";
  return (
    <PageShell
      title={name || " "}
      actions={
        <div
          role="radiogroup"
          aria-label="Sort"
          className="flex rounded-full bg-white/6 p-1 ring-1 ring-white/10"
        >
          {SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={sort === s.value}
              onClick={() => setSort(s.value)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
                sort === s.value ? "bg-white text-black" : "text-white/70 hover:text-white",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      }
    >
      {titles.isPending ? (
        <GridSkeleton />
      ) : titles.isError ? (
        <StateMessage
          tone="error"
          title="We couldn't load this category"
          action={{ label: "Try again", onClick: () => void titles.refetch() }}
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
