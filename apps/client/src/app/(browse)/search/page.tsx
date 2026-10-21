"use client";

import { Clock, Search, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { GridSkeleton, TitleGrid } from "@/components/browse/title-grid";
import { Button, IconButton } from "@/components/ui/button";
import { useConfig } from "@/components/providers/config";
import { StateMessage } from "@/components/ui/state-message";
import type { TitleCard } from "@/lib/types";
import { useNewAndPopular, useSearch, useSearchSuggestions } from "@/lib/queries";
import { clearRecent, pushRecent, readRecent } from "@/lib/recent-searches";

const DEBOUNCE_MS = 200;

function SearchScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [query, setQuery] = useState(urlQuery.trim());
  const results = useSearch(query);
  const suggestions = useSearchSuggestions();
  const popular = useNewAndPopular();
  const config = useConfig();
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    setRecent(readRecent());
  }, []);
  // Remember searches that found something (on this device, per profile).
  useEffect(() => {
    if (query && results.data?.length && !results.isPlaceholderData) setRecent(pushRecent(query));
  }, [query, results.data, results.isPlaceholderData]);

  useEffect(() => {
    setValue(urlQuery);
  }, [urlQuery]);
  // Instant results: debounce keystrokes, keep the URL shareable.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(value.trim());
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      if ((params.get("q") ?? "") !== value.trim())
        router.replace(`/search?${next}`, { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, params, router]);

  return (
    <div className="page-fade px-[max(4vw,16px)] pt-[calc(var(--header-h)+env(safe-area-inset-top)+24px)] pb-28 lg:pb-16">
      <label className="focus-within:ring-accent mb-8 flex h-14 items-center gap-3 rounded-xl bg-white/8 px-4 ring-1 ring-white/10 focus-within:ring-2 md:hidden">
        <Search className="size-5 text-white/60" />
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="search"
          enterKeyHint="search"
          placeholder="Titles, people, genres"
          aria-label="Search"
          className="text-body flex-1 bg-transparent outline-none placeholder:text-white/40 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <IconButton variant="ghost" size="sm" label="Clear search" onClick={() => setValue("")}>
            <X />
          </IconButton>
        )}
      </label>
      {!query ? (
        <div className="space-y-10">
          <div className="grid gap-10 md:grid-cols-2">
            <SuggestionList
              icon={<TrendingUp className="size-4" />}
              title="Top searches"
              items={suggestions.data?.top ?? []}
              onPick={setValue}
            />
            <SuggestionList
              icon={<Clock className="size-4" />}
              title="Your recent searches"
              items={recent}
              onPick={setValue}
              empty="Searches you make will show up here."
              onClear={
                recent.length
                  ? () => {
                      clearRecent();
                      setRecent([]);
                    }
                  : undefined
              }
            />
          </div>
          <PopularGrid
            items={popular.data?.everyone_watching}
            title={`Popular on ${config.str("branding.site_name", "NETFLY")}`}
          />
        </div>
      ) : results.isPending ? (
        <GridSkeleton />
      ) : results.data?.length ? (
        <>
          <p className="text-muted text-body mb-5">
            Results for <span className="font-semibold text-white">“{query}”</span>
          </p>
          <TitleGrid items={results.data} dimmed={results.isPlaceholderData} />
        </>
      ) : (
        <div className="space-y-10">
          <StateMessage title={`No matches for “${query}”`}>
            Try a different spelling, a genre like{" "}
            <Link href="/search?q=Drama" className="text-white underline">
              Drama
            </Link>
            , or switch the translation filter.
          </StateMessage>
          {(suggestions.data?.top?.length ?? 0) > 0 && (
            <SuggestionList
              icon={<TrendingUp className="size-4" />}
              title="Try one of these"
              items={suggestions.data?.top ?? []}
              onPick={setValue}
            />
          )}
          <PopularGrid items={popular.data?.everyone_watching} title="You might like" />
        </div>
      )}
    </div>
  );
}

function PopularGrid({ items, title }: { items?: TitleCard[]; title: string }) {
  if (!items?.length) return null;
  return (
    <section>
      <h2 className="text-h3 mb-4 font-bold">{title}</h2>
      <TitleGrid items={items.slice(0, 12)} />
    </section>
  );
}

function SuggestionList({
  icon,
  title,
  items,
  onPick,
  empty,
  onClear,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  onPick: (q: string) => void;
  empty?: string;
  onClear?: () => void;
}) {
  return (
    <section>
      <h2 className="text-body mb-3 flex items-center gap-2 font-bold tracking-wider text-white/60 uppercase">
        {icon} {title}
        {onClear && (
          <Button variant="ghost" size="sm" className="ml-auto normal-case" onClick={onClear}>
            Clear
          </Button>
        )}
      </h2>
      {items.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((q) => (
            <li key={q}>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-full font-semibold"
                onClick={() => onPick(q)}
              >
                {q}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-body">{empty ?? "Nothing yet."}</p>
      )}
    </section>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchScreen />
    </Suspense>
  );
}
