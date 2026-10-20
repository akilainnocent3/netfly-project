"use client";

import { Clock, Search, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { GridSkeleton, TitleGrid } from "@/components/browse/title-grid";
import { StateMessage } from "@/components/ui/state-message";
import { useSearch, useSearchSuggestions } from "@/lib/queries";

function SearchScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [query, setQuery] = useState(urlQuery.trim());
  const results = useSearch(query);
  const suggestions = useSearchSuggestions();

  useEffect(() => setValue(urlQuery), [urlQuery]);
  // Instant results: debounce keystrokes, keep the URL shareable.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(value.trim());
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      if ((params.get("q") ?? "") !== value.trim()) router.replace(`/search?${next}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, params, router]);

  return (
    <div className="px-[max(4vw,16px)] pb-28 pt-[calc(var(--header-h)+24px)] lg:pb-16">
      <label className="mb-8 flex h-14 items-center gap-3 rounded-xl bg-white/8 px-4 ring-1 ring-white/10 focus-within:ring-2 focus-within:ring-accent md:hidden">
        <Search className="size-5 text-white/60" />
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Titles, people, genres" aria-label="Search" className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-white/40" />
        {value && <button type="button" aria-label="Clear" onClick={() => setValue("")}><X className="size-5 text-white/60" /></button>}
      </label>
      {!query ? (
        <div className="grid gap-10 md:grid-cols-2">
          <SuggestionList icon={<TrendingUp className="size-4" />} title="Top searches" items={suggestions.data?.top ?? []} onPick={setValue} />
          <SuggestionList icon={<Clock className="size-4" />} title="Your recent searches" items={suggestions.data?.recent ?? []} onPick={setValue} empty="Searches you make will show up here." />
        </div>
      ) : results.isPending ? (
        <GridSkeleton />
      ) : results.data?.length ? (
        <>
          <p className="mb-5 text-[15px] text-muted">
            Results for <span className="font-semibold text-white">“{query}”</span>
          </p>
          <TitleGrid items={results.data} dimmed={results.isPlaceholderData} />
        </>
      ) : (
        <StateMessage title={`No matches for “${query}”`}>
          Try a different spelling, a genre like <Link href="/search?q=Drama" className="text-white underline">Drama</Link>, or switch the translation filter.
        </StateMessage>
      )}
    </div>
  );
}

function SuggestionList({ icon, title, items, onPick, empty }: { icon: React.ReactNode; title: string; items: string[]; onPick: (q: string) => void; empty?: string }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold uppercase tracking-wider text-white/60">{icon} {title}</h2>
      {items.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((q) => (
            <li key={q}>
              <button type="button" onClick={() => onPick(q)} className="rounded-full bg-white/8 px-4 py-2 text-[14px] font-medium ring-1 ring-white/10 transition hover:bg-white/15">{q}</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted">{empty ?? "Nothing yet."}</p>
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
