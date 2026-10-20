"use client";

import { cn } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import { Info, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBillboard, useMode } from "@/lib/queries";
import type { BillboardItem } from "@/lib/types";
import { useConfig } from "../providers/config";
import { NetflyImage } from "../ui/netfly-image";
import { titleHref, watchHref } from "./card";
import { prefetchPlayback, PreviewVideo } from "./preview-video";

export function Hero({ initial }: { initial?: { mode: string; items: BillboardItem[] } }) {
  const config = useConfig();
  const mode = useMode();
  const billboard = useBillboard(initial);
  const [first, setFirst] = useState(true);
  const items = billboard.data ?? [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const seconds = config.num("ux.billboard_rotate_seconds", 12);

  useEffect(() => setIndex(0), [mode]);
  useEffect(() => {
    if (index !== 0 || items.length === 0) setFirst(false);
  }, [index, items.length, mode]);
  useEffect(() => {
    if (items.length < 2 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), seconds * 1000);
    return () => clearInterval(timer);
  }, [items.length, paused, seconds]);

  const item = items[index % Math.max(1, items.length)];
  if (billboard.isPending) return <HeroSkeleton />;
  if (!item) return <div className="h-[calc(var(--header-h)+24px)]" />;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative h-[78svh] min-h-[460px] w-full overflow-hidden md:h-[88svh] md:max-h-[980px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence initial={false} mode="sync">
        <m.div
          key={`${mode}-${item.title.id}`}
          initial={first ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0"
        >
          <HeroSlide
            item={item}
            priority={index === 0}
            trailers={config.bool("features.hero_trailers", true)}
            animate={!first}
          />
        </m.div>
      </AnimatePresence>
      {items.length > 1 && (
        <div
          className="absolute right-[max(4vw,16px)] bottom-[15%] z-20 hidden gap-1.5 md:flex"
          role="tablist"
          aria-label="Featured titles"
        >
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={it.title.title}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === index ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/70",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HeroSlide({
  item,
  priority,
  trailers,
  animate,
}: {
  item: BillboardItem;
  priority: boolean;
  trailers: boolean;
  animate: boolean;
}) {
  const title = item.title;
  const synopsis = item.tagline || title.short_synopsis;
  return (
    <>
      <div className="absolute inset-0">
        <NetflyImage
          image={title.backdrop}
          alt=""
          sizes="100vw"
          priority={priority}
          className="object-cover object-[70%_center] md:object-center"
          fallback={
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgb(var(--accent-rgb)/0.35),transparent_60%),#111117]" />
          }
        />
        {trailers && item.use_trailer && title.has_preview && (
          <PreviewVideo title={title} loop={false} showMute />
        )}
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(77deg,rgb(0_0_0/0.85)_0%,rgb(0_0_0/0.45)_38%,transparent_70%)]" />
      <div className="from-bg via-bg/60 absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t to-transparent" />
      <div className="absolute inset-x-0 bottom-[16%] z-10 px-[max(4vw,16px)] md:bottom-[22%]">
        <m.div
          initial={animate ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[min(640px,90vw)]"
        >
          {item.headline && (
            <p className="text-accent mb-3 text-[13px] font-bold tracking-[0.25em] uppercase">
              {item.headline}
            </p>
          )}
          {title.logo ? (
            <h1 className="relative mb-5 h-[clamp(70px,12vw,170px)] w-[min(560px,80vw)]">
              <NetflyImage
                image={title.logo}
                alt={title.title}
                sizes="560px"
                priority={priority}
                className="object-contain object-left-bottom drop-shadow-[0_4px_24px_rgb(0_0_0/0.6)]"
              />
            </h1>
          ) : (
            <h1 className="text-shadow mb-4 text-[clamp(40px,7vw,96px)] leading-[0.9] font-black tracking-[-0.03em] uppercase">
              {title.title}
            </h1>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[14px] text-white/85">
            {title.match ? (
              <span className="font-bold text-emerald-400">{title.match}% match</span>
            ) : null}
            {title.year && <span>{title.year}</span>}
            {title.type === "series" && title.season_count ? (
              <span>
                {title.season_count} Season{title.season_count === 1 ? "" : "s"}
              </span>
            ) : null}
            {title.translation_status === "translated" && title.translator_name && (
              <span className="rounded bg-white/10 px-2 py-0.5 text-[12px] font-semibold backdrop-blur">
                Translated · {title.translator_name}
              </span>
            )}
          </div>
          {synopsis && (
            <p className="text-shadow line-clamp-3 max-w-[560px] text-[15px] leading-relaxed text-white/90 md:text-[18px]">
              {synopsis}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={watchHref(title)}
              onMouseEnter={() => prefetchPlayback(title)}
              className="flex h-11 items-center gap-2.5 rounded-md bg-white px-6 text-[16px] font-bold text-black transition hover:bg-white/80 md:h-12 md:px-8 md:text-[18px]"
            >
              <Play className="size-6 fill-current" /> Play
            </Link>
            <Link
              href={titleHref(title)}
              scroll={false}
              className="flex h-11 items-center gap-2.5 rounded-md bg-white/25 px-6 text-[16px] font-bold text-white backdrop-blur-md transition hover:bg-white/35 md:h-12 md:px-7 md:text-[18px]"
            >
              <Info className="size-6" /> More Info
            </Link>
          </div>
        </m.div>
      </div>
      {title.maturity_rating && (
        <span className="absolute right-0 bottom-[22%] z-10 hidden border-l-[3px] border-white/70 bg-black/40 py-1.5 pr-[max(4vw,16px)] pl-3 text-[15px] font-medium backdrop-blur md:block">
          {title.maturity_rating}
        </span>
      )}
    </>
  );
}

function HeroSkeleton() {
  return (
    <div
      aria-hidden
      className="relative h-[78svh] min-h-[460px] overflow-hidden md:h-[88svh] md:max-h-[980px]"
    >
      <div className="skeleton absolute inset-0 opacity-40" />
      <div className="from-bg absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t to-transparent" />
      <div className="absolute bottom-[22%] left-[max(4vw,16px)] space-y-4">
        <div className="skeleton h-20 w-[min(480px,70vw)] rounded-lg" />
        <div className="skeleton h-4 w-[min(420px,70vw)] rounded" />
        <div className="skeleton h-4 w-[min(360px,60vw)] rounded" />
        <div className="flex gap-3 pt-2">
          <div className="skeleton h-12 w-32 rounded-md" />
          <div className="skeleton h-12 w-40 rounded-md" />
        </div>
      </div>
    </div>
  );
}
