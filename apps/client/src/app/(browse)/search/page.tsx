"use client";

import { cn } from "@netfly/ui";
import { Play, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useRef, useState } from "react";
import { PlayLink } from "@/components/auth/auth-gate";
import { Card, titleHref } from "@/components/browse/card";
import { GridSkeleton, TitleGrid } from "@/components/browse/title-grid";
import { Button, IconButton } from "@/components/ui/button";
import { NetflyImage } from "@/components/ui/netfly-image";
import { useSearch, useSearchSuggestions } from "@/lib/queries";
import { clearRecent, pushRecent, readRecent } from "@/lib/recent-searches";
import type { TitleCard } from "@/lib/types";
import { useMedia } from "@/lib/use-media";

const DEBOUNCE_MS = 180;

/** /search?q=… — keep every other param (translation…), replace the URL in place. */
function searchUrl(params: URLSearchParams, q: string): string {
  const next = new URLSearchParams(params.toString());
  if (q) next.set("q", q);
  else next.delete("q");
  const rest = next.toString();
  return rest ? `/search?${rest}` : "/search";
}

function SearchScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const desktop = useMedia("(min-width: 768px)");
  const query = (params.get("q") ?? "").trim();
  const results = useSearch(query);
  const suggestions = useSearchSuggestions();
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    setRecent(readRecent());
  }, []);
  // Remember searches that found something (on this device, per profile).
  useEffect(() => {
    if (query && results.data?.results.length && !results.isPlaceholderData)
      setRecent(pushRecent(query));
  }, [query, results.data, results.isPlaceholderData]);

  const pick = (q: string) => router.replace(searchUrl(params, q), { scroll: false });
  const data = results.data;
  // Previous results stay (dimmed) while the next ones load: no flashing skeleton after the first.
  const loading = !!query && results.isPending;
  const stale = results.isPlaceholderData;

  return (
    <div className="page-fade px-[max(4vw,16px)] pt-[calc(var(--header-h)+env(safe-area-inset-top)+24px)] pb-28 lg:pb-16">
      {!desktop ? <MobileSearchInput /> : null}
      {!query ? (
        desktop ? (
          <DesktopIdle
            recent={recent}
            top={suggestions.data?.top_titles ?? []}
            onPick={pick}
            onClear={() => {
              clearRecent();
              setRecent([]);
            }}
          />
        ) : (
          <MobileIdle
            recent={recent}
            top={suggestions.data?.top_titles}
            onPick={pick}
            onClear={() => {
              clearRecent();
              setRecent([]);
            }}
          />
        )
      ) : loading ? (
        desktop ? (
          <GridSkeleton />
        ) : (
          <PosterGridSkeleton />
        )
      ) : data && data.results.length ? (
        <div data-testid="search-results" aria-busy={stale || undefined}>
          {desktop ? (
            <>
              {data.related.length ? (
                <p className="text-body mb-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[#808080]">
                  <span>Explore titles related to:</span>
                  {data.related.map((term, i) => (
                    <Fragment key={term.label}>
                      {i > 0 ? (
                        <span aria-hidden className="text-[#808080]">
                          |
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => pick(term.label)}
                        className="rounded text-white hover:underline focus-visible:outline-2 focus-visible:outline-white"
                      >
                        {term.label}
                      </button>
                    </Fragment>
                  ))}
                </p>
              ) : null}
              <TitleGrid items={data.results} dimmed={stale} />
            </>
          ) : (
            <>
              <h2 className="text-h3 mb-3 font-bold">Movies &amp; Series</h2>
              <ul
                className={cn(
                  "grid grid-cols-3 gap-2 transition-opacity duration-300",
                  stale && "opacity-50",
                )}
              >
                {data.results.map((title) => (
                  <li key={title.id}>
                    <Card title={title} variant="poster" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <NoMatches query={query} />
      )}
    </div>
  );
}

/** Phones: the page's own box (the header box is desktop only). */
function MobileSearchInput() {
  const params = useSearchParams();
  const router = useRouter();
  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const written = useRef(urlQuery);
  // Follow the URL when it changes from elsewhere (Back, a suggestion), not while typing.
  useEffect(() => {
    if (urlQuery !== written.current) {
      written.current = urlQuery;
      setValue(urlQuery);
    }
  }, [urlQuery]);
  useEffect(() => {
    const q = value.trim();
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => {
      written.current = q;
      router.replace(searchUrl(params, q), { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, params, router]);
  return (
    <label className="mb-6 flex h-11 items-center gap-3 rounded-[4px] bg-[#333] px-3 focus-within:outline-2 focus-within:outline-white">
      <Search className="size-5 shrink-0 text-[#b3b3b3]" aria-hidden />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="search"
        enterKeyHint="search"
        placeholder="Search shows, movies…"
        aria-label="Search"
        className="text-body min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#b3b3b3] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <IconButton variant="ghost" size="sm" label="Clear search" onClick={() => setValue("")}>
          <X />
        </IconButton>
      ) : null}
    </label>
  );
}

function RecentSearches({
  recent,
  onPick,
  onClear,
}: {
  recent: string[];
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  if (!recent.length) return null;
  return (
    <section className="mb-8">
      <h2 className="text-h3 mb-3 flex items-center font-bold">
        Recent searches
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
          Clear
        </Button>
      </h2>
      <ul className="flex flex-wrap gap-2">
        {recent.map((q) => (
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
    </section>
  );
}

/** Desktop /search with no query yet (opened directly): recent searches and Top Searches. */
function DesktopIdle({
  recent,
  top,
  onPick,
  onClear,
}: {
  recent: string[];
  top: TitleCard[];
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  return (
    <>
      <RecentSearches recent={recent} onPick={onPick} onClear={onClear} />
      {top.length ? (
        <section>
          <h2 className="text-h3 mb-4 font-bold">Top Searches</h2>
          <TitleGrid items={top} />
        </section>
      ) : null}
    </>
  );
}

/** Phones before typing: "Top Searches" as a list — thumbnail, title, an outlined play button. */
function MobileIdle({
  recent,
  top,
  onPick,
  onClear,
}: {
  recent: string[];
  top: TitleCard[] | undefined;
  onPick: (q: string) => void;
  onClear: () => void;
}) {
  return (
    <>
      <RecentSearches recent={recent} onPick={onPick} onClear={onClear} />
      <section aria-labelledby="top-searches">
        <h2 id="top-searches" className="text-h3 mb-3 font-bold">
          Top Searches
        </h2>
        <ul className="space-y-1" data-testid="top-searches">
          {(top ?? Array.from({ length: 6 }, () => null)).map((title, i) =>
            title ? (
              <li key={title.id} className="flex items-center bg-[#141414]">
                <Link
                  href={titleHref(title)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-white"
                >
                  <span className="bg-surface relative aspect-video w-[40%] shrink-0 overflow-hidden rounded-sm">
                    <NetflyImage
                      image={title.backdrop ?? title.poster}
                      alt=""
                      sizes="40vw"
                      className="object-cover"
                    />
                  </span>
                  <span className="text-body line-clamp-2 min-w-0 flex-1 font-semibold">
                    {title.title}
                  </span>
                </Link>
                <PlayLink
                  slug={title.slug}
                  episode={title.context?.episode_id}
                  titleName={title.title}
                  aria-label={`Play ${title.title}`}
                  className="mr-1 ml-2 grid size-11 shrink-0 place-items-center rounded-full border-2 border-white/80 text-white transition-colors duration-150 hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97]"
                >
                  <Play className="ml-0.5 size-5 fill-current" />
                </PlayLink>
              </li>
            ) : (
              <li key={i} aria-hidden className="flex items-center gap-3">
                <span className="skeleton aspect-video w-[40%] rounded-sm" />
                <span className="skeleton h-4 flex-1 rounded" />
              </li>
            ),
          )}
        </ul>
      </section>
    </>
  );
}

function PosterGridSkeleton() {
  return (
    <ul aria-hidden className="grid grid-cols-3 gap-2">
      {Array.from({ length: 9 }, (_, i) => (
        <li key={i} className="skeleton aspect-[2/3] rounded-sm" />
      ))}
    </ul>
  );
}

/** Netflix's empty state, word for word in spirit. */
function NoMatches({ query }: { query: string }) {
  return (
    <div className="mx-auto max-w-xl py-10 md:py-16" data-testid="no-matches">
      <p className="text-lead">Your search for &quot;{query}&quot; did not have any matches.</p>
      <p className="text-body mt-4 text-[#b3b3b3]">Suggestions:</p>
      <ul className="text-body mt-2 list-disc space-y-1 pl-6 text-[#b3b3b3]">
        <li>Try different keywords</li>
        <li>Looking for a movie or series?</li>
        <li>Try using a movie, series title, an actor or director</li>
        <li>Try a genre, like comedy, romance, sports, or drama</li>
      </ul>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchScreen />
    </Suspense>
  );
}
