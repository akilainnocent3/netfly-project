"use client";

import { cn } from "@netfly/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Row as RowData } from "@/lib/types";
import { PageDots } from "../ui/page-dots";
import { RowArrow } from "../ui/row-arrow";
import { SkeletonArea } from "../ui/skeleton";
import { Card } from "./card";

// The scroller's content box is the viewport minus both gutters; cards fill it plus the right
// gutter so the last visible card is cut off — the "peek" that invites scrolling.
const CARD_WIDTH = "calc((100% + max(4vw, 16px) - (var(--cols) - 1) * 0.45vw) / var(--cols))";

/** True once `ref` comes within 800px of the viewport (then stays true). */
function useNear(ref: React.RefObject<HTMLElement | null>, eager: boolean): boolean {
  const [near, setNear] = useState(eager);
  useEffect(() => {
    if (near || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setNear(true),
      { rootMargin: "800px 0px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near, ref]);
  return near;
}

/**
 * Horizontal row: scroll-snap, a half-visible "peek" card, arrow paging by exactly one page
 * (wrapping around at the end) with a dash page indicator on desktop, swipe on touch, and ←/→
 * keyboard navigation between cards.
 */
export function Row({
  row,
  index,
  seeAllHref,
  lazy = false,
}: {
  row: RowData;
  index: number;
  seeAllHref?: string;
  /** Offscreen rows keep their heading (for navigation) but render cards only when near. */
  lazy?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const near = useNear(section, !lazy);
  const [paging, setPaging] = useState({ page: 0, pages: 1, start: true });
  const [paged, setPaged] = useState(false);
  const top10 = row.kind === "top10";

  /** Cards per page = the whole cards visible (--cols without the peek). */
  const geometry = useCallback(() => {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>("[data-card]");
    if (!el || !card) return null;
    const next = card.nextElementSibling as HTMLElement | null;
    const step = next ? next.offsetLeft - card.offsetLeft : card.offsetWidth;
    const cols = parseFloat(getComputedStyle(el).getPropertyValue("--cols")) || 1;
    const perPage = Math.max(1, Math.floor(cols));
    return { el, step, perPage, pages: Math.max(1, Math.ceil(row.items.length / perPage)) };
  }, [row.items.length]);

  const update = useCallback(() => {
    const g = geometry();
    if (!g) return;
    const atEnd = g.el.scrollLeft + g.el.clientWidth >= g.el.scrollWidth - 8;
    const page = atEnd ? g.pages - 1 : Math.round(g.el.scrollLeft / (g.step * g.perPage));
    setPaging({ page: Math.min(page, g.pages - 1), pages: g.pages, start: g.el.scrollLeft < 8 });
  }, [geometry]);
  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update, row.items.length]);

  const page = (direction: 1 | -1) => {
    const g = geometry();
    if (!g) return;
    setPaged(true);
    let target = paging.page + direction;
    if (target >= g.pages) target = 0; // wrap around to the first page
    if (target < 0) target = g.pages - 1;
    g.el.scrollTo({ left: target * g.perPage * g.step, behavior: "smooth" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const links = Array.from(
      scroller.current?.querySelectorAll<HTMLAnchorElement>("[data-card] a[href^='/title']") ?? [],
    );
    const current = links.findIndex((l) => l === document.activeElement);
    if (current === -1) return;
    e.preventDefault();
    const next =
      links[Math.min(links.length - 1, Math.max(0, current + (e.key === "ArrowRight" ? 1 : -1)))];
    next?.focus();
    next?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  };

  const headingId = `row-${row.key}`;
  return (
    <section
      ref={section}
      aria-labelledby={headingId}
      className="group/row relative"
      style={{ zIndex: 40 - index }}
    >
      <div className="mb-2 flex items-center gap-3 px-[max(4vw,16px)] md:mb-3">
        <h2 id={headingId} className="text-lead md:text-h3 font-bold tracking-tight text-white/95">
          {row.title}
        </h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-accent text-meta font-semibold opacity-0 transition-opacity group-hover/row:opacity-100 focus:opacity-100"
          >
            Explore all ›
          </Link>
        )}
        <PageDots
          count={paging.pages}
          active={paging.page}
          className="ml-auto hidden opacity-0 transition-opacity group-hover/row:opacity-100 md:flex"
        />
      </div>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={update}
          onKeyDown={onKeyDown}
          className={cn(
            "no-scrollbar flex snap-x snap-mandatory gap-[0.45vw] overflow-x-auto scroll-smooth px-[max(4vw,16px)] pt-1 pb-6",
            "scroll-px-[max(4vw,16px)] [--cols:2.3] sm:[--cols:3.3] md:[--cols:4.3] lg:[--cols:5.3] 2xl:[--cols:6.3]",
            top10 &&
              "[--cols:1.6] sm:[--cols:2.6] md:[--cols:3.4] lg:[--cols:4.4] 2xl:[--cols:5.4]",
          )}
        >
          {!near && <SkeletonCards />}
          {near &&
            row.items.map((item, i) => (
              <div
                key={item.id}
                data-card
                className="shrink-0 snap-start"
                style={{ width: CARD_WIDTH }}
              >
                {top10 ? (
                  <div className="flex items-end">
                    <span
                      aria-hidden
                      className="text-bg text-numeral -mr-[6%] leading-[0.78] font-black tracking-[-0.08em] select-none [-webkit-text-stroke:3px_rgb(255_255_255/0.55)]"
                    >
                      {i + 1}
                    </span>
                    <div className="relative w-[55%] shrink-0">
                      <Card
                        title={item}
                        variant="poster"
                        rank={i + 1}
                        priority={index === 0 && i < 4}
                      />
                    </div>
                  </div>
                ) : (
                  <Card title={item} priority={index === 0 && i < 6} rowKind={row.kind} />
                )}
              </div>
            ))}
        </div>
        {/* Like Netflix: no "previous" until the row has been paged once. */}
        <RowArrow side="left" hidden={!paged && paging.start} onClick={() => page(-1)} />
        <RowArrow side="right" hidden={paging.pages < 2} onClick={() => page(1)} />
      </div>
    </section>
  );
}

function SkeletonCards() {
  return (
    <>
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="skeleton aspect-video shrink-0 rounded-md"
          style={{ width: CARD_WIDTH }}
        />
      ))}
    </>
  );
}

/** `loader`: this row is the page's first placeholder, so it carries the one loader. */
export function RowSkeleton({
  titleWidth = 180,
  loader = false,
}: {
  titleWidth?: number;
  loader?: boolean;
}) {
  if (loader)
    return (
      <SkeletonArea>
        <RowSkeleton titleWidth={titleWidth} />
      </SkeletonArea>
    );
  return (
    <div aria-hidden className="mb-10">
      <div className="skeleton mx-[max(4vw,16px)] mb-3 h-5 rounded" style={{ width: titleWidth }} />
      <div className="flex gap-[0.45vw] overflow-hidden px-[max(4vw,16px)] [--cols:2.3] sm:[--cols:3.3] md:[--cols:4.3] lg:[--cols:5.3] 2xl:[--cols:6.3]">
        {Array.from({ length: 7 }, (_, i) => (
          <div
            key={i}
            className="skeleton aspect-video shrink-0 rounded-md"
            style={{ width: CARD_WIDTH }}
          />
        ))}
      </div>
    </div>
  );
}
