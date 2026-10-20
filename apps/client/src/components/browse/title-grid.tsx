"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { TitleCard } from "@/lib/types";
import { Card } from "./card";

export function TitleGrid({ items, onEnd, loadingMore, dimmed }: { items: TitleCard[]; onEnd?: () => void; loadingMore?: boolean; dimmed?: boolean }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !onEnd) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onEnd(), { rootMargin: "800px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onEnd]);
  return (
    <>
      <ul className={`grid grid-cols-2 gap-x-[0.6vw] gap-y-[2.4vw] transition-opacity duration-300 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 ${dimmed ? "opacity-50" : ""}`}>
        <AnimatePresence initial={false}>
          {items.map((item, i) => (
            <motion.li key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.015 }}>
              <Card title={item} priority={i < 6} />
            </motion.li>
          ))}
        </AnimatePresence>
        {loadingMore && Array.from({ length: 6 }, (_, i) => <li key={`s${i}`} aria-hidden className="skeleton aspect-video rounded-md" />)}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
    </>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <ul aria-hidden className="grid grid-cols-2 gap-x-[0.6vw] gap-y-[2.4vw] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: count }, (_, i) => <li key={i} className="skeleton aspect-video rounded-md" />)}
    </ul>
  );
}

export function PageShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-[max(4vw,16px)] pb-28 pt-[calc(var(--header-h)+28px)] lg:pb-16">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(26px,3.4vw,42px)] font-black tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}
