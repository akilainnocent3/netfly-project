"use client";

import type { Schemas } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Row, RowSkeleton } from "@/components/browse/row";
import { RemindButton } from "@/components/browse/remind-button";
import { TitleGrid, GridSkeleton } from "@/components/browse/title-grid";
import { NetflyImage } from "@/components/ui/netfly-image";
import { StateMessage } from "@/components/ui/state-message";
import { useNewAndPopular } from "@/lib/queries";
import { Pressable } from "@/components/ui/pressable";

type Upcoming = Schemas["Upcoming"];

const TABS = [
  { key: "coming-soon", label: "🍿 Coming Soon" },
  { key: "everyone", label: "🔥 Everyone's Watching" },
  { key: "top-series", label: "🔟 Top 10 Series" },
  { key: "top-films", label: "🔟 Top 10 Films" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function NewAndPopular() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : "coming-soon";
  const data = useNewAndPopular();

  return (
    <div className="page-fade px-[max(4vw,16px)] pt-[calc(var(--header-h)+env(safe-area-inset-top)+20px)] pb-28 lg:pb-16">
      <h1 className="text-h1 mb-5 font-bold">New &amp; Popular</h1>
      <div
        role="tablist"
        aria-label="New and popular"
        className="no-scrollbar bg-bg/95 sticky top-[calc(var(--header-h)+env(safe-area-inset-top))] z-30 -mx-[max(4vw,16px)] mb-6 flex gap-2 overflow-x-auto px-[max(4vw,16px)] py-2"
      >
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => router.replace(`/new-and-popular?tab=${t.key}`, { scroll: false })}
            className={cn(
              "text-meta h-9 shrink-0 rounded-full px-4 font-bold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-white pointer-coarse:h-11",
              tab === t.key ? "bg-white text-black" : "bg-[#232323] text-white hover:bg-white/20",
            )}
          >
            {t.label}
          </Pressable>
        ))}
      </div>

      {data.isError ? (
        <StateMessage
          tone="error"
          title="We couldn't load New & Popular"
          action={{ label: "Try again", onClick: () => void data.refetch() }}
        >
          Check your connection and try again.
        </StateMessage>
      ) : tab === "coming-soon" ? (
        <ComingSoon items={data.data?.coming_soon} />
      ) : tab === "everyone" ? (
        data.data ? (
          <TitleGrid items={data.data.everyone_watching} dimmed={data.isPlaceholderData} />
        ) : (
          <GridSkeleton />
        )
      ) : data.data ? (
        <div className="-mx-[max(4vw,16px)]">
          <Row
            index={0}
            row={{
              key: tab,
              kind: "top10",
              title: tab === "top-series" ? "Top 10 Series Today" : "Top 10 Films Today",
              items: tab === "top-series" ? data.data.top10_series : data.data.top10_films,
            }}
          />
        </div>
      ) : (
        <RowSkeleton />
      )}
    </div>
  );
}

function launchDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    day: d.getDate(),
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
  };
}

function ComingSoon({ items }: { items?: Upcoming[] }) {
  if (!items) return <GridSkeleton count={4} />;
  if (items.length === 0)
    return (
      <StateMessage title="Nothing scheduled yet">
        New titles are announced here as soon as they are scheduled.
      </StateMessage>
    );
  return (
    <ol className="max-w-4xl space-y-10" data-testid="coming-soon">
      {items.map((t) => {
        const date = launchDate(t.publish_at);
        return (
          <li key={t.id} className="flex gap-4">
            {date && (
              <div className="w-12 shrink-0 text-center" aria-hidden>
                <p className="text-meta font-bold text-[#b3b3b3]">{date.month}</p>
                <p className="text-h1 leading-none font-black">{date.day}</p>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="relative aspect-video overflow-hidden rounded-md bg-[#232323]">
                <NetflyImage
                  image={t.backdrop ?? t.poster}
                  alt=""
                  sizes="(min-width:1024px) 800px, 85vw"
                  className="object-cover"
                  fallback={
                    // Artwork often lands after scheduling: show the name, not an empty box.
                    <span className="text-title grid size-full place-items-center bg-[radial-gradient(ellipse_at_top,#2f2f2f,#181818_70%)] px-6 text-center font-black tracking-tight text-white/85 uppercase">
                      {t.title}
                    </span>
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h2 className="text-h3 mr-auto font-bold">{t.title}</h2>
                {/* Signed out (`reminded` null): still offered — it opens the sign-in gate. */}
                <RemindButton title={t} reminded={!!t.reminded} />
              </div>
              {date && <p className="text-body mt-1 text-white/85">Coming {date.weekday}</p>}
              <p className="text-body mt-2 text-[#b3b3b3]">{t.synopsis || t.short_synopsis}</p>
              {t.genres.length > 0 && (
                <p className="text-meta mt-2 text-white/85">{t.genres.join(" • ")}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
