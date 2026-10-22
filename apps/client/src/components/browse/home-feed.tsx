"use client";

import { AnimatePresence, m } from "framer-motion";
import { useEffect, useRef } from "react";
import { useHome, useMode } from "@/lib/queries";
import type { BillboardItem } from "@/lib/types";
import { ErrorBoundary } from "../ui/error-boundary";
import { StateMessage } from "../ui/state-message";
import { Hero } from "./hero";
import { Row, RowSkeleton } from "./row";

export function HomeFeed({
  initialBillboard,
  kind,
  heading,
  backdrop = false,
}: {
  initialBillboard?: { mode: string; items: BillboardItem[] };
  kind?: "movie" | "series";
  /** Series / Films pages: a page title over the hero, like Netflix's category pages. */
  heading?: string;
  /** Behind a title page's modal: that page's h1 is the title, not the billboard. */
  backdrop?: boolean;
}) {
  const mode = useMode();
  const home = useHome(kind);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = home;

  // Infinite vertical feed: load the next rows well before the bottom.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rows = home.data?.pages.flatMap((p) => p.rows) ?? [];
  return (
    <div className="page-fade pb-tabbar">
      {heading && (
        <h1 className="text-h1 absolute top-[calc(var(--header-h)+env(safe-area-inset-top)+8px)] left-[max(4vw,16px)] z-20 font-bold max-md:sr-only">
          {heading}
        </h1>
      )}
      <ErrorBoundary fallback={() => <div className="h-[56vh] md:h-[80vh]" />}>
        <Hero
          initial={initialBillboard}
          kind={kind}
          headingLevel={heading || backdrop ? "h2" : "h1"}
        />
      </ErrorBoundary>
      <div className="relative z-10 -mt-[11vh] space-y-[clamp(18px,2.4vw,40px)] md:-mt-[13vh]">
        {home.isPending &&
          Array.from({ length: 4 }, (_, i) => <RowSkeleton key={i} titleWidth={140 + i * 30} />)}
        {home.isError && !rows.length && (
          <StateMessage
            tone="error"
            title={navigatorOffline() ? "You're offline" : "We couldn't load your rows"}
            action={{ label: "Try again", onClick: () => void home.refetch() }}
          >
            {navigatorOffline()
              ? "Reconnect and we'll pick up where you left off."
              : "Something went wrong on our side. It usually clears up in a moment."}
          </StateMessage>
        )}
        {!home.isPending && !home.isError && rows.length === 0 && (
          <StateMessage title="Nothing here yet">
            New titles are on the way. Try switching the translation filter at the top.
          </StateMessage>
        )}
        <AnimatePresence mode="popLayout" initial={false}>
          <m.div
            key={mode}
            initial={{ opacity: 0 }}
            animate={{ opacity: home.isPlaceholderData ? 0.45 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-[clamp(18px,2.4vw,40px)]"
          >
            {rows.map((row, i) => (
              <ErrorBoundary key={`${row.key}-${i}`} resetKey={row}>
                <Row row={row} index={i} lazy={i >= 3} />
              </ErrorBoundary>
            ))}
          </m.div>
        </AnimatePresence>
        {isFetchingNextPage && <RowSkeleton />}
        <div ref={sentinel} aria-hidden className="h-px" />
      </div>
    </div>
  );
}

function navigatorOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}
