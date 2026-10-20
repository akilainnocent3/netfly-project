"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useHome, useMode } from "@/lib/queries";
import { StateMessage } from "../ui/state-message";
import { Hero } from "./hero";
import { Row, RowSkeleton } from "./row";

export function HomeFeed() {
  const mode = useMode();
  const home = useHome();
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
    <div className="pb-28 lg:pb-16">
      <Hero />
      <div className="relative z-10 -mt-[11vh] space-y-[clamp(18px,2.4vw,40px)] md:-mt-[13vh]">
        {home.isPending && Array.from({ length: 4 }, (_, i) => <RowSkeleton key={i} titleWidth={140 + i * 30} />)}
        {home.isError && !rows.length && (
          <StateMessage
            tone="error"
            title={navigatorOffline() ? "You're offline" : "We couldn't load your rows"}
            action={{ label: "Try again", onClick: () => void home.refetch() }}
          >
            {navigatorOffline() ? "Reconnect and we'll pick up where you left off." : "Something went wrong on our side. It usually clears up in a moment."}
          </StateMessage>
        )}
        {!home.isPending && !home.isError && rows.length === 0 && (
          <StateMessage title="Nothing here yet">
            New titles are on the way. Try switching the translation filter at the top.
          </StateMessage>
        )}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0 }}
            animate={{ opacity: home.isPlaceholderData ? 0.45 : 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-[clamp(18px,2.4vw,40px)]"
          >
            {rows.map((row, i) => (
              <Row key={`${row.key}-${i}`} row={row} index={i} />
            ))}
          </motion.div>
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
