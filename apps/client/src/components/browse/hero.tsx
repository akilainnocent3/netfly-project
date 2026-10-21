"use client";

import { cn } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import { Check, Info, Play, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBillboard, useInList, useMode, useMyListToggle, usePendingFor } from "@/lib/queries";
import type { BillboardItem, TitleCard } from "@/lib/types";
import { useMedia } from "@/lib/use-media";
import { useConfig } from "../providers/config";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { NetflyImage } from "../ui/netfly-image";
import { PageDots } from "../ui/page-dots";
import { PlayLink, useAuthGate } from "../auth/auth-gate";
import { titleHref } from "./card";
import { prefetchPlayback, PreviewVideo, type PreviewState } from "./preview-video";

const TRAILER_DELAY_MS = 2000;

export function Hero({
  initial,
  kind,
}: {
  initial?: { mode: string; items: BillboardItem[] };
  kind?: "movie" | "series";
}) {
  const config = useConfig();
  const mode = useMode();
  const billboard = useBillboard(initial, kind);
  const [first, setFirst] = useState(true);
  const items = billboard.data ?? [];
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [preview, setPreview] = useState<PreviewState>("idle");
  const seconds = config.num("ux.billboard_rotate_seconds", 12);
  const desktop = useMedia("(min-width: 768px)");

  useEffect(() => {
    setIndex(0);
  }, [mode, kind]);
  useEffect(() => {
    setPreview("idle");
  }, [index, mode]);
  useEffect(() => {
    if (index !== 0 || items.length === 0) setFirst(false);
  }, [index, items.length, mode]);
  // Never rotate away mid-trailer; resume once it ends (or if there is none).
  useEffect(() => {
    if (items.length < 2 || hovered || preview === "playing") return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % items.length), seconds * 1000);
    return () => clearTimeout(timer);
  }, [items.length, hovered, preview, seconds, index]);

  const item = items[index % Math.max(1, items.length)];
  if (billboard.isPending) return <HeroSkeleton />;
  if (!item) return <div className="h-[calc(var(--header-h)+24px)]" />;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative w-full overflow-hidden md:h-[88svh] md:max-h-[980px] md:min-h-[460px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <AnimatePresence initial={false} mode="sync">
        <m.div
          key={`${mode}-${item.title.id}`}
          initial={first ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, position: "absolute" }}
          transition={{ duration: 0.8 }}
          className="inset-0 md:absolute"
        >
          {/* Both layouts render (CSS picks one) so the server-rendered LCP image never swaps. */}
          <div className="hidden md:block">
            <HeroSlide
              item={item}
              priority={index === 0}
              trailers={desktop && config.bool("features.hero_trailers", true)}
              animate={!first}
              preview={preview}
              onPreview={setPreview}
            />
          </div>
          <div className="md:hidden">
            <PosterHero item={item} priority={index === 0} />
          </div>
        </m.div>
      </AnimatePresence>
      <PageDots
        className="absolute right-[max(4vw,16px)] bottom-[15%] z-20 hidden md:flex"
        label="Featured titles"
        count={items.length}
        active={index}
        labels={items.map((it) => it.title.title)}
        onSelect={setIndex}
      />
    </section>
  );
}

function Top10Line({ title }: { title: TitleCard }) {
  if (!title.top10_rank) return null;
  return (
    <p className="text-lead mb-3 flex items-center gap-2.5 font-bold text-white">
      <Badge kind="top10" rank={title.top10_rank} className="h-8" />#{title.top10_rank} in{" "}
      {title.type === "series" ? "Series" : "Films"} Today
    </p>
  );
}

function HeroSlide({
  item,
  priority,
  trailers,
  animate,
  preview,
  onPreview,
}: {
  item: BillboardItem;
  priority: boolean;
  trailers: boolean;
  animate: boolean;
  preview: PreviewState;
  onPreview: (s: PreviewState) => void;
}) {
  const title = item.title;
  const synopsis = item.tagline || title.short_synopsis;
  const playing = preview === "playing";
  // Once the trailer has started, the copy steps back: smaller logo, shorter synopsis.
  const compact = preview !== "idle";
  return (
    <div className="relative h-[88svh] max-h-[980px] min-h-[460px]">
      <div className="absolute inset-0">
        <NetflyImage
          image={title.backdrop}
          alt=""
          sizes="100vw"
          priority={priority}
          className="object-cover object-center"
          fallback={
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgb(var(--accent-rgb)/0.35),transparent_60%),#141414]" />
          }
        />
        {trailers && item.use_trailer && title.has_preview && (
          <PreviewVideo
            title={title}
            loop={false}
            showMute
            delayMs={TRAILER_DELAY_MS}
            onStateChange={onPreview}
            controlsClassName="absolute right-[calc(max(4vw,16px)+88px)] bottom-[22%] z-20 translate-y-[3px]"
          />
        )}
      </div>
      <div
        className={cn(
          "absolute inset-0 bg-[linear-gradient(77deg,rgb(0_0_0/0.85)_0%,rgb(0_0_0/0.45)_38%,transparent_70%)] transition-opacity duration-1000",
          playing && "opacity-60",
        )}
      />
      <div className="from-bg via-bg/60 absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t to-transparent" />
      <div className="absolute inset-x-0 bottom-[22%] z-10 px-[max(4vw,16px)]">
        <m.div
          initial={animate ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[min(640px,90vw)]"
        >
          {item.headline && (
            <p className="text-accent text-meta mb-3 font-bold tracking-[0.25em] uppercase">
              {item.headline}
            </p>
          )}
          <m.div
            animate={{ scale: compact ? 0.72 : 1 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "left bottom" }}
          >
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
              <h1 className="text-shadow text-display mb-4 leading-[0.9] font-black tracking-[-0.03em] uppercase">
                {title.title}
              </h1>
            )}
          </m.div>
          <Top10Line title={title} />
          <div className="text-body mb-3 flex flex-wrap items-center gap-2 text-white/85">
            {title.match ? (
              <span className="text-match font-bold">{title.match}% Match</span>
            ) : null}
            {title.year && <span>{title.year}</span>}
            {title.type === "series" && title.season_count ? (
              <span>
                {title.season_count} Season{title.season_count === 1 ? "" : "s"}
              </span>
            ) : null}
            {title.translation_status === "translated" && title.translator_name && (
              <span className="text-meta rounded bg-white/10 px-2 py-0.5 font-semibold backdrop-blur">
                Translated · {title.translator_name}
              </span>
            )}
          </div>
          {synopsis && (
            <p
              className={cn(
                "text-shadow text-body md:text-lead max-w-[560px] leading-relaxed text-white/90 transition-all duration-700",
                compact ? "line-clamp-1 opacity-0 lg:line-clamp-2 lg:opacity-90" : "line-clamp-3",
                playing && "lg:opacity-0",
              )}
            >
              {synopsis}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              asChild
              variant="play"
              size="lg"
              icon={<Play className="fill-current" />}
              onMouseEnter={() => prefetchPlayback(title)}
            >
              <PlayLink
                slug={title.slug}
                episode={title.context?.episode_id}
                titleName={title.title}
              >
                Play
              </PlayLink>
            </Button>
            <Button asChild variant="secondary" size="lg" icon={<Info />}>
              <Link href={titleHref(title)} scroll={false}>
                More Info
              </Link>
            </Button>
          </div>
        </m.div>
      </div>
      {title.maturity_rating && (
        <span
          data-testid="hero-maturity"
          className="text-body absolute right-0 bottom-[22%] z-10 border-l-[3px] border-white/70 bg-[rgb(51_51_51/0.6)] py-1.5 pr-[max(4vw,16px)] pl-3 font-medium"
        >
          {title.maturity_rating}
        </span>
      )}
    </div>
  );
}

/** Phones: a centred 2:3 poster card over the blurred artwork (Netflix mobile layout). */
function PosterHero({ item, priority }: { item: BillboardItem; priority: boolean }) {
  const title = item.title;
  return (
    <div className="relative px-[max(6vw,16px)] pt-[calc(var(--header-h)+env(safe-area-inset-top)+56px)] pb-8">
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <NetflyImage
          image={title.backdrop ?? title.poster}
          alt=""
          sizes="100vw"
          className="scale-110 object-cover opacity-60 blur-2xl"
        />
        <div className="from-bg absolute inset-0 bg-gradient-to-t via-transparent to-black/40" />
      </div>
      <div className="relative mx-auto aspect-[2/3] w-full max-w-[420px] overflow-hidden rounded-lg shadow-[0_20px_60px_rgb(0_0_0/0.7)] ring-1 ring-white/10">
        <NetflyImage
          image={title.poster ?? title.backdrop}
          alt=""
          sizes="90vw"
          priority={priority}
          className="object-cover"
          fallback={<div className="absolute inset-0 bg-[#232323]" />}
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-x-4 bottom-4 text-center">
          {title.logo ? (
            <div className="relative mx-auto mb-3 h-16 w-[70%]">
              <NetflyImage
                image={title.logo}
                alt={title.title}
                sizes="300px"
                className="object-contain object-bottom"
              />
            </div>
          ) : (
            <h1 className="text-h1 mb-2 leading-none font-black uppercase">{title.title}</h1>
          )}
          {title.top10_rank ? (
            <p className="text-meta mb-2 flex items-center justify-center gap-1.5 font-bold">
              <Badge kind="top10" rank={title.top10_rank} />#{title.top10_rank} in{" "}
              {title.type === "series" ? "Series" : "Films"} Today
            </p>
          ) : null}
          {title.genres.length > 0 && (
            <p className="text-meta mb-4 text-white/85">{title.genres.join(" • ")}</p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <Button asChild variant="play" size="md" icon={<Play className="fill-current" />}>
              <PlayLink
                slug={title.slug}
                episode={title.context?.episode_id}
                titleName={title.title}
              >
                Play
              </PlayLink>
            </Button>
            <MyListLabelled title={title} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MyListLabelled({ title }: { title: TitleCard }) {
  const local = useInList();
  const toggle = useMyListToggle(title);
  const pending = usePendingFor("mylist", title.id);
  const gate = useAuthGate();
  const inList =
    (local.data && title.id in local.data ? local.data[title.id] : title.in_my_list) ?? false;
  return (
    <Button
      variant="secondary"
      size="md"
      loading={pending}
      aria-pressed={inList}
      icon={inList ? <Check strokeWidth={2.6} /> : <Plus strokeWidth={2.6} />}
      onClick={() =>
        gate({ action: "my_list", slug: title.slug, titleId: title.id, titleName: title.title }) &&
        toggle.toggleNow(!inList)
      }
    >
      My List
    </Button>
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
