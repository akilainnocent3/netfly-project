"use client";

import { LazyLogoLoader } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import { useEffect, useRef } from "react";
import type { TitleCard } from "@/lib/types";
import { Card } from "./card";

export function TitleGrid({
  items,
  onEnd,
  loadingMore,
  dimmed,
}: {
  items: TitleCard[];
  onEnd?: () => void;
  loadingMore?: boolean;
  dimmed?: boolean;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !onEnd) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onEnd(), {
      rootMargin: "800px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onEnd]);
  return (
    <>
      <ul
        className={`grid grid-cols-2 gap-x-[0.6vw] gap-y-[2.4vw] transition-opacity duration-300 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 ${dimmed ? "opacity-50" : ""}`}
      >
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <m.li
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.015 }}
            >
              <Card title={item} priority={i < 6} />
            </m.li>
          ))}
        </AnimatePresence>
        {loadingMore &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={`s${i}`} aria-hidden className="skeleton aspect-video rounded-md" />
          ))}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
    </>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div aria-busy className="relative">
      <ul
        aria-hidden
        className="grid grid-cols-2 gap-x-[0.6vw] gap-y-[2.4vw] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6"
      >
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="skeleton aspect-video rounded-md" />
        ))}
      </ul>
      {/* One loader for the whole grid, over its first rows (not one per card). */}
      <div className="absolute inset-x-0 top-0 grid h-[min(40vh,320px)] place-items-center">
        <LazyLogoLoader size="md" />
      </div>
    </div>
  );
}

export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-[max(4vw,16px)] pt-[calc(var(--header-h)+28px)] pb-28 lg:pb-16">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-black tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted text-body mt-1">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
