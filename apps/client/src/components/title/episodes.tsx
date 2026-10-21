"use client";

import { cn, formatRuntime } from "@netfly/ui";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronDown, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEpisodes } from "@/lib/queries";
import type { Episode, TitleDetail } from "@/lib/types";
import { Button } from "../ui/button";
import { NetflyImage } from "../ui/netfly-image";

const SEASON_KEY = (slug: string) => `netfly-season:${slug}`;

export function Episodes({
  title,
  preferredSeason,
  scrollParent,
}: {
  title: TitleDetail;
  preferredSeason: number | null;
  scrollParent: React.RefObject<HTMLElement | null>;
}) {
  const seasons = title.seasons;
  const initial = useMemo(() => {
    let stored: number | null = null;
    try {
      stored = Number(localStorage.getItem(SEASON_KEY(title.slug))) || null;
    } catch {
      /* ignore */
    }
    const candidates = [preferredSeason, stored, seasons[0]?.number ?? null];
    return candidates.find((n) => n !== null && seasons.some((s) => s.number === n)) ?? null;
  }, [preferredSeason, seasons, title.slug]);
  const [season, setSeason] = useState<number | null>(initial);
  useEffect(() => setSeason(initial), [initial]);
  const episodes = useEpisodes(title.slug, season);
  const items = episodes.data?.pages.flatMap((p) => p.results) ?? [];
  const current = seasons.find((s) => s.number === season);

  const choose = (n: number) => {
    setSeason(n);
    try {
      localStorage.setItem(SEASON_KEY(title.slug), String(n));
    } catch {
      /* ignore */
    }
  };

  if (!seasons.length) return null;
  return (
    <section aria-labelledby="episodes-heading" className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 id="episodes-heading" className="text-h3 font-bold">
          Episodes
        </h3>
        {seasons.length > 1 ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="secondary" className="border border-white/20 bg-[#242424]">
                {current?.display_name} <ChevronDown className="size-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="bg-elevated z-[90] min-w-52 rounded-lg border border-white/10 p-1 shadow-2xl"
              >
                {seasons.map((s) => (
                  <DropdownMenu.Item
                    key={s.id}
                    onSelect={() => choose(s.number)}
                    className="text-body flex h-10 cursor-pointer items-center justify-between gap-6 rounded-md px-3 outline-none data-[highlighted]:bg-white/10"
                  >
                    <span className={cn(s.number === season && "font-bold")}>{s.display_name}</span>
                    <span className="text-muted text-meta">{s.episode_count} episodes</span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : (
          <span className="text-muted text-body font-semibold">{current?.display_name}</span>
        )}
      </div>
      {episodes.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-28 rounded-lg" />
          ))}
        </div>
      ) : items.length > 30 ? (
        <VirtualList
          items={items}
          slug={title.slug}
          scrollParent={scrollParent}
          onEnd={() => episodes.hasNextPage && void episodes.fetchNextPage()}
        />
      ) : (
        <ol className="divide-y divide-white/8 border-y border-white/8">
          {items.map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} slug={title.slug} />
          ))}
        </ol>
      )}
      {episodes.hasNextPage && items.length <= 30 && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            loading={episodes.isFetchingNextPage}
            onClick={() => void episodes.fetchNextPage()}
          >
            More episodes
          </Button>
        </div>
      )}
    </section>
  );
}

function VirtualList({
  items,
  slug,
  scrollParent,
  onEnd,
}: {
  items: Episode[];
  slug: string;
  scrollParent: React.RefObject<HTMLElement | null>;
  onEnd: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParent.current,
    estimateSize: () => 128,
    overscan: 6,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= items.length - 5) onEnd();
  }, [virtualItems, items.length, onEnd]);
  return (
    <ol
      ref={listRef}
      className="relative border-y border-white/8"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualItems.map((v) => (
        <div
          key={v.key}
          data-index={v.index}
          ref={virtualizer.measureElement}
          className="absolute inset-x-0 border-b border-white/8"
          style={{ transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
        >
          <EpisodeRow episode={items[v.index]!} slug={slug} />
        </div>
      ))}
    </ol>
  );
}

function EpisodeRow({ episode, slug }: { episode: Episode; slug: string }) {
  const href = `/watch/${slug}?episode=${episode.id}`;
  const content = (
    <>
      <span className="text-h3 w-6 shrink-0 text-center font-semibold text-white/60">
        {episode.number}
      </span>
      <div className="bg-surface relative aspect-video w-[132px] shrink-0 overflow-hidden rounded-md md:w-[168px]">
        <NetflyImage image={episode.thumbnail} alt="" sizes="168px" className="object-cover" />
        {episode.available && (
          <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover/ep:opacity-100">
            <span className="grid size-10 place-items-center rounded-full border-2 border-white bg-black/50">
              <Play className="size-4 translate-x-px fill-white" />
            </span>
          </span>
        )}
        {episode.progress > 0 && !episode.watched && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <div className="bg-accent h-full" style={{ width: `${episode.progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body truncate font-semibold">{episode.name}</p>
          <span className="text-body shrink-0 text-white/70">
            {formatRuntime(episode.runtime_minutes)}
          </span>
        </div>
        <p className="text-body mt-1 line-clamp-2 leading-snug text-white/65">{episode.synopsis}</p>
        {episode.watched && (
          <p className="text-meta text-match mt-1.5 flex items-center gap-1 font-semibold">
            <Check className="size-3.5" /> Watched
          </p>
        )}
      </div>
    </>
  );
  return (
    <li className="list-none">
      {episode.available ? (
        <Link
          href={href}
          className="group/ep flex items-center gap-4 rounded-md px-2 py-4 transition-colors hover:bg-white/5 md:px-4"
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-center gap-4 px-2 py-4 opacity-50 md:px-4">{content}</div>
      )}
    </li>
  );
}
