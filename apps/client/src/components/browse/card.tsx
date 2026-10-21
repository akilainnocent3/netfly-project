"use client";

import { cn, formatRuntime } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import { ChevronDown, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TitleCard } from "@/lib/types";
import { useConfig } from "../providers/config";
import { Badge, badgeFromApi } from "../ui/badge";
import { IconButton } from "../ui/button";
import { ContinueMenu } from "./continue-menu";
import { NetflyImage } from "../ui/netfly-image";
import { MyListButton } from "./my-list-button";
import { PreviewVideo, prefetchPlayback } from "./preview-video";
import { RatingButton } from "./rating-button";

export function titleHref(title: TitleCard): string {
  return `/title/${title.slug}`;
}

export function watchHref(title: TitleCard): string {
  const episode = title.context?.episode_id;
  return episode ? `/watch/${title.slug}?episode=${episode}` : `/watch/${title.slug}`;
}

function metaLine(title: TitleCard): string {
  if (title.type === "series")
    return title.season_count
      ? `${title.season_count} Season${title.season_count === 1 ? "" : "s"}`
      : "Series";
  return formatRuntime(title.runtime_minutes);
}

/** Title art: the backdrop with the logo (or bold title) laid over it. */
export function CardArt({
  title,
  sizes,
  priority,
  showText = true,
}: {
  title: TitleCard;
  sizes: string;
  priority?: boolean;
  showText?: boolean;
}) {
  return (
    <div className="absolute inset-0">
      <NetflyImage
        image={title.backdrop ?? title.poster}
        alt=""
        sizes={sizes}
        priority={priority}
        className="object-cover"
        fallback={
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(var(--accent-rgb)/0.35),transparent_60%),linear-gradient(135deg,#1d1d27,#0e0e13)]" />
        }
      />
      {showText && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-3 bottom-2.5 flex items-end">
            {title.logo ? (
              <div
                className="relative h-[34%] max-h-12 w-[62%]"
                style={{ aspectRatio: `${title.logo.width}/${title.logo.height}` }}
              >
                <NetflyImage
                  image={title.logo}
                  alt={title.title}
                  sizes="200px"
                  className="object-contain object-left-bottom drop-shadow-[0_2px_8px_rgb(0_0_0/0.7)]"
                />
              </div>
            ) : (
              <p className="text-card line-clamp-2 leading-tight font-extrabold tracking-tight text-white uppercase drop-shadow-[0_2px_6px_rgb(0_0_0/0.8)]">
                {title.title}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Scrolling moves cards under a still pointer and Chrome then fires mouseenter/mousemove on them;
// like Netflix, a preview only opens after the pointer itself has moved since the last scroll.
let lastScrollAt = 0;
let scrolledSinceMove = false;
let pointer = { x: -1, y: -1 };
if (typeof window !== "undefined") {
  const opts = { passive: true, capture: true };
  window.addEventListener(
    "scroll",
    () => {
      lastScrollAt = performance.now();
      scrolledSinceMove = true;
    },
    opts,
  );
  window.addEventListener(
    "mousemove",
    (e) => {
      if (e.clientX === pointer.x && e.clientY === pointer.y) return; // synthetic post-scroll event
      pointer = { x: e.clientX, y: e.clientY };
      scrolledSinceMove = false;
    },
    opts,
  );
}

function canHover(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

export function Card({
  title,
  variant = "wide",
  rank,
  priority,
  onDislike,
  rowKind,
}: {
  title: TitleCard;
  variant?: "wide" | "poster";
  rank?: number;
  priority?: boolean;
  onDislike?: () => void;
  rowKind?: string;
}) {
  const continuing = rowKind === "continue_watching";
  const badge = badgeFromApi(title.badge);
  const config = useConfig();
  const router = useRouter();
  const ref = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Viewport rect plus the scroll offset at open: the panel keeps its document position even if
  // the page scrolls while its menu is open (focusing a menu near the bottom edge scrolls).
  const [anchor, setAnchor] = useState<{ rect: DOMRect; scrollY: number } | null>(null);
  const progress = title.context?.progress;
  const label = title.context?.label;
  const hoverEnabled = config.bool("features.hover_previews", true);
  // Netflix-like intent delay: long enough to skip cards the pointer merely crosses.
  const delay = Math.min(500, Math.max(400, config.num("ux.hover_preview_delay_ms", 450)));

  // A menu inside the hover card renders in a portal; while it's open, leaving the card or the
  // small scroll caused by focusing the menu must not close the card underneath it.
  const menuOpen = useRef(false);
  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    menuOpen.current = false;
    setAnchor(null);
  }, []);

  useEffect(() => {
    if (!anchor) return;
    const onScroll = () => !menuOpen.current && close();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [anchor, close]);
  const armHover = () => {
    if (!hoverEnabled || !canHover()) return;
    if (scrolledSinceMove) return;
    const armedAt = performance.now();
    prefetchPlayback(title);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (lastScrollAt >= armedAt) return; // the page scrolled during the intent delay
      if (ref.current)
        setAnchor({ rect: ref.current.getBoundingClientRect(), scrollY: window.scrollY });
    }, delay);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div className="relative">
      <Link
        ref={ref}
        href={titleHref(title)}
        scroll={false}
        prefetch={false}
        aria-label={`${title.title}${label ? `, continue ${label}` : ""}`}
        onMouseEnter={armHover}
        onMouseMove={() => !timer.current && !anchor && armHover()}
        onMouseLeave={() => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
        }}
        onFocus={() => prefetchPlayback(title)}
        className={cn(
          "group/card bg-surface relative block w-full overflow-hidden rounded-md outline-offset-4 transition-transform duration-200",
          variant === "poster" ? "aspect-[2/3]" : "aspect-video",
        )}
      >
        {variant === "poster" ? (
          <NetflyImage
            image={title.poster}
            alt={title.title}
            sizes="(min-width:1280px) 14vw, (min-width:768px) 20vw, 40vw"
            priority={priority}
            className="object-cover"
            fallback={<CardArt title={title} sizes="20vw" />}
          />
        ) : (
          <CardArt
            title={title}
            sizes="(min-width:1536px) 17vw, (min-width:1024px) 20vw, (min-width:640px) 30vw, 45vw"
            priority={priority}
          />
        )}
        {badge === "top10" && rank === undefined && (
          <Badge
            kind="top10"
            rank={title.top10_rank}
            className="absolute top-0 right-1.5 rounded-t-none"
          />
        )}
        {badge && badge !== "top10" && typeof progress !== "number" && (
          <Badge
            kind={badge}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-b-none whitespace-nowrap"
          />
        )}
        {title.context?.other_mode && (
          <span className="text-caption absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-semibold tracking-wide text-white/85 uppercase">
            {title.translation_status === "translated" ? "Translated" : "Original"}
          </span>
        )}
        {typeof progress === "number" && (
          <div className="absolute inset-x-0 bottom-0">
            {label && (
              <span className="text-caption absolute right-3 bottom-2.5 rounded bg-black/70 px-1.5 py-0.5 font-semibold text-white">
                {label}
              </span>
            )}
            <div className="h-[3px] bg-white/25">
              <div
                className="bg-accent h-full"
                style={{ width: `${Math.max(4, progress * 100)}%` }}
              />
            </div>
          </div>
        )}
        <span className="pointer-events-none absolute inset-0 rounded-md ring-0 ring-white/0 transition group-focus-visible/card:ring-2 group-focus-visible/card:ring-white" />
      </Link>
      {continuing && (
        // Touch devices have no hover card: the ⋯ menu sits on the card itself.
        <ContinueMenu
          title={title}
          className="absolute top-1.5 right-1.5 z-10 hidden pointer-coarse:inline-flex"
        />
      )}
      {rank !== undefined && <span className="sr-only">Number {rank}</span>}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {anchor && (
              <HoverPanel
                key="panel"
                title={title}
                rect={anchor.rect}
                scrollY={anchor.scrollY}
                onClose={close}
                onDislike={onDislike}
                continuing={continuing}
                isMenuOpen={() => menuOpen.current}
                setMenuOpen={(open) => (menuOpen.current = open)}
                onOpen={() => {
                  close();
                  router.push(titleHref(title), { scroll: false });
                }}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function HoverPanel({
  title,
  rect,
  scrollY,
  onClose,
  onOpen,
  onDislike,
  continuing,
  isMenuOpen,
  setMenuOpen,
}: {
  title: TitleCard;
  rect: DOMRect;
  scrollY: number;
  onClose: () => void;
  onOpen: () => void;
  onDislike?: () => void;
  continuing?: boolean;
  isMenuOpen: () => boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const badge = badgeFromApi(title.badge);
  const scale = 1.5;
  const width = Math.max(rect.width * scale, 300);
  const margin = 16;
  const centerLeft = rect.left + rect.width / 2 - width / 2;
  const left = Math.min(Math.max(margin, centerLeft), window.innerWidth - width - margin);
  const mediaHeight = (width * 9) / 16;
  const top = Math.max(margin, rect.top + rect.height / 2 - mediaHeight / 2 - 10) + scrollY;
  // Keep the whole panel on screen (like Netflix): a card on the bottom edge opens upwards, so its
  // buttons never need a scroll — and scrolling closes the panel.
  const panel = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  useLayoutEffect(() => {
    const height = panel.current?.offsetHeight ?? 0; // layout size, unaffected by the zoom-in
    const viewportTop = top - scrollY;
    const overflow = viewportTop + height - (window.innerHeight - margin);
    setLift(Math.max(0, Math.min(overflow, viewportTop - margin)));
  }, [top, scrollY]);
  const originY = rect.top + rect.height / 2 + scrollY - (top - lift);
  const origin = `${((rect.left + rect.width / 2 - left) / width) * 100}% ${originY}px`;
  const meta = metaLine(title);

  return (
    <m.div
      ref={panel}
      role="dialog"
      aria-label={`${title.title} preview`}
      initial={{ opacity: 0, scale: 1 / scale }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1 / scale, transition: { duration: 0.15 } }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      onMouseLeave={() => !isMenuOpen() && onClose()}
      style={{ position: "absolute", top: top - lift, left, width, transformOrigin: origin }}
      className="bg-surface z-[60] overflow-hidden rounded-lg shadow-[0_24px_70px_-10px_rgb(0_0_0/0.85)] ring-1 ring-white/8"
    >
      <Link
        href={titleHref(title)}
        scroll={false}
        onClick={onClose}
        className="relative block aspect-video w-full overflow-hidden"
        aria-label={`More info about ${title.title}`}
      >
        <CardArt title={title} sizes="480px" />
        {title.has_preview && <PreviewVideo title={title} />}
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <IconButton asChild variant="play" label={`Play ${title.title}`}>
            <Link href={watchHref(title)}>
              <Play className="translate-x-px fill-current" />
            </Link>
          </IconButton>
          <MyListButton title={title} />
          <RatingButton
            title={title}
            onDisliked={() => {
              onDislike?.();
              onClose();
            }}
          />
          {continuing && (
            <ContinueMenu
              title={title}
              onAction={onClose}
              onOpenChange={setMenuOpen}
              className="ml-auto"
            />
          )}
          <IconButton
            label={title.type === "series" ? "Episodes and info" : "More info"}
            onClick={onOpen}
            className={continuing ? undefined : "ml-auto"}
          >
            <ChevronDown />
          </IconButton>
        </div>
        <div className="text-meta flex flex-wrap items-center gap-x-2 gap-y-1">
          {typeof title.match === "number" && (
            <span className="text-match font-bold">{title.match}% Match</span>
          )}
          {title.maturity_rating && (
            <span className="text-caption rounded border border-white/40 px-1.5 leading-5 font-medium text-white/85">
              {title.maturity_rating}
            </span>
          )}
          {meta && <span className="text-white/80">{meta}</span>}
          {title.year && <span className="text-white/60">{title.year}</span>}
          <span className="text-caption rounded border border-white/30 px-1 leading-4 font-semibold text-white/70">
            HD
          </span>
        </div>
        {badge && (
          <p className="text-meta flex items-center gap-2 font-semibold text-white">
            <Badge kind={badge} rank={title.top10_rank} />
            {badge === "top10" && title.top10_rank
              ? `#${title.top10_rank} in ${title.type === "series" ? "Series" : "Films"} Today`
              : null}
          </p>
        )}
        {title.genres.length > 0 && (
          <p className="text-meta text-white/85">{title.genres.join(" • ")}</p>
        )}
        {title.translation_status === "translated" && title.translator_name && (
          <p className="text-meta text-white/55">Translated by {title.translator_name}</p>
        )}
      </div>
    </m.div>
  );
}
