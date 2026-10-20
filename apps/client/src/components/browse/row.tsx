"use client";

import { cn } from "@netfly/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Row as RowData } from "@/lib/types";
import { Card } from "./card";

// The scroller's content box is the viewport minus both gutters; cards fill it plus the right
// gutter so the last visible card is cut off — the "peek" that invites scrolling.
const CARD_WIDTH = "calc((100% + max(4vw, 16px) - (var(--cols) - 1) * 0.45vw) / var(--cols))";

/**
 * Horizontal row: scroll-snap, a half-visible "peek" card, arrow paging on
 * desktop, swipe on touch, and ←/→ keyboard navigation between cards.
 */
export function Row({ row, index, seeAllHref }: { row: RowData; index: number; seeAllHref?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const top10 = row.kind === "top10";

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);
  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update, row.items.length]);

  const page = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * (el.clientWidth - el.clientWidth * 0.08), behavior: "smooth" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const links = Array.from(scroller.current?.querySelectorAll<HTMLAnchorElement>("[data-card] a[href^='/title']") ?? []);
    const current = links.findIndex((l) => l === document.activeElement);
    if (current === -1) return;
    e.preventDefault();
    const next = links[Math.min(links.length - 1, Math.max(0, current + (e.key === "ArrowRight" ? 1 : -1)))];
    next?.focus();
    next?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  };

  const headingId = `row-${row.key}`;
  return (
    <section aria-labelledby={headingId} className="group/row relative" style={{ zIndex: 40 - index }}>
      <div className="mb-2 flex items-baseline gap-3 px-[max(4vw,16px)] md:mb-3">
        <h2 id={headingId} className="text-[17px] font-bold tracking-tight text-white/95 md:text-[21px]">
          {row.title}
        </h2>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-[13px] font-semibold text-accent opacity-0 transition-opacity group-hover/row:opacity-100 focus:opacity-100">
            Explore all ›
          </Link>
        )}
      </div>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={update}
          onKeyDown={onKeyDown}
          className={cn(
            "no-scrollbar flex snap-x snap-mandatory gap-[0.45vw] overflow-x-auto scroll-smooth px-[max(4vw,16px)] pb-6 pt-1",
            "scroll-px-[max(4vw,16px)] [--cols:2.3] sm:[--cols:3.3] md:[--cols:4.3] lg:[--cols:5.3] 2xl:[--cols:6.3]",
            top10 && "[--cols:1.6] sm:[--cols:2.6] md:[--cols:3.4] lg:[--cols:4.4] 2xl:[--cols:5.4]",
          )}
        >
          {row.items.map((item, i) => (
            <div
              key={item.id}
              data-card
              className="shrink-0 snap-start"
              style={{ width: CARD_WIDTH }}
            >
              {top10 ? (
                <div className="flex items-end">
                  <span aria-hidden className="-mr-[6%] select-none text-[clamp(90px,11vw,190px)] font-black leading-[0.78] tracking-[-0.08em] text-bg [-webkit-text-stroke:3px_rgb(255_255_255/0.55)]">
                    {i + 1}
                  </span>
                  <div className="relative w-[55%] shrink-0">
                    <Card title={item} variant="poster" rank={i + 1} priority={index === 0 && i < 4} />
                  </div>
                </div>
              ) : (
                <Card title={item} priority={index === 0 && i < 6} />
              )}
            </div>
          ))}
        </div>
        <ArrowButton side="left" hidden={edges.start} onClick={() => page(-1)} />
        <ArrowButton side="right" hidden={edges.end} onClick={() => page(1)} />
      </div>
    </section>
  );
}

function ArrowButton({ side, hidden, onClick }: { side: "left" | "right"; hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      onClick={onClick}
      className={cn(
        "absolute top-1 bottom-6 z-20 hidden w-[max(4vw,16px)] items-center justify-center bg-black/55 text-white opacity-0 transition-opacity duration-200 hover:bg-black/75 md:flex",
        side === "left" ? "left-0 rounded-r-md" : "right-0 rounded-l-md",
        !hidden && "group-hover/row:opacity-100",
        hidden && "pointer-events-none",
      )}
    >
      {side === "left" ? <ChevronLeft className="size-8 transition-transform hover:scale-125" /> : <ChevronRight className="size-8 transition-transform hover:scale-125" />}
    </button>
  );
}

export function RowSkeleton({ titleWidth = 180 }: { titleWidth?: number }) {
  return (
    <div aria-hidden className="mb-10">
      <div className="skeleton mx-[max(4vw,16px)] mb-3 h-5 rounded" style={{ width: titleWidth }} />
      <div className="flex gap-[0.45vw] overflow-hidden px-[max(4vw,16px)] [--cols:2.3] sm:[--cols:3.3] md:[--cols:4.3] lg:[--cols:5.3] 2xl:[--cols:6.3]">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="skeleton aspect-video shrink-0 rounded-md" style={{ width: CARD_WIDTH }} />
        ))}
      </div>
    </div>
  );
}
