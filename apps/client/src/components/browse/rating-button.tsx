"use client";

import { cn } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { removeFromHome, useRate, useRatings } from "@/lib/queries";
import type { TitleCard } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../ui/toast";

type Value = -1 | 1 | 2;
const CHOICES: Array<{ value: Value; label: string }> = [
  { value: -1, label: "Not for me" },
  { value: 1, label: "I like this" },
  { value: 2, label: "Love this!" },
];

function DoubleThumb({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex", className)} aria-hidden>
      <ThumbsUp className="size-full" />
      <ThumbsUp className="absolute -top-[20%] -right-[35%] size-full opacity-90" />
    </span>
  );
}

function Icon({ value, className }: { value: Value | null; className?: string }) {
  if (value === -1) return <ThumbsDown className={className} />;
  if (value === 2) return <DoubleThumb className={className} />;
  return <ThumbsUp className={className} />;
}

/** One thumb that blooms into 👎 · 👍 · 👍👍. Optimistic, with a tiny celebration. */
export function RatingButton({
  title,
  size = "md",
  onDisliked,
}: {
  title: TitleCard;
  size?: "md" | "lg";
  onDisliked?: () => void;
}) {
  const ratings = useRatings();
  const rate = useRate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raw = ratings.data && title.id in ratings.data ? ratings.data[title.id] : title.rating;
  const current: Value | null = raw === -1 || raw === 1 || raw === 2 ? raw : null;
  const dim = size === "lg" ? "size-11" : "size-9";
  const icon = size === "lg" ? "size-5" : "size-[18px]";

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  // Close on Escape or a tap elsewhere (touch has no mouseleave).
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) =>
      root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (value: Value) => {
    const next = current === value ? null : value;
    rate.mutate({ title, value: next });
    setOpen(false);
    if (next && next > 0) setBurst((b) => b + 1);
    if (next === -1) {
      onDisliked?.();
      removeFromHome(queryClient, title.id);
      toast({
        message: "We'll show you less like this.",
        action: {
          label: "Undo",
          onClick: () => {
            rate.mutate({ title, value: current });
            void queryClient.invalidateQueries({ queryKey: ["home"] });
          },
        },
      });
    }
  };

  return (
    <div
      ref={root}
      className="relative"
      onMouseEnter={() => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setOpen(false), 250);
      }}
    >
      <button
        type="button"
        aria-label={
          current
            ? `Rated: ${CHOICES.find((c) => c.value === current)?.label}. Change rating`
            : "Rate this title"
        }
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          "grid place-items-center rounded-full border-2 transition-colors",
          dim,
          current
            ? "border-white bg-white/15 text-white"
            : "border-white/45 bg-black/40 text-white hover:border-white",
        )}
      >
        <Icon value={current} className={icon} />
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            initial={{ opacity: 0, scale: 0.6, y: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: "spring", stiffness: 520, damping: 30 }}
            className="bg-elevated/98 absolute top-1/2 left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full p-1.5 shadow-[0_10px_40px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
          >
            {CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                role="menuitemradio"
                aria-checked={current === choice.value}
                aria-label={choice.label}
                title={choice.label}
                onClick={() => choose(choice.value)}
                className={cn(
                  "group/choice grid place-items-center rounded-full transition-all hover:scale-110 hover:bg-white/15",
                  dim,
                  current === choice.value && "bg-white/20",
                )}
              >
                <Icon value={choice.value} className={icon} />
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {burst > 0 && (
          <m.span
            key={burst}
            aria-hidden
            initial={{ opacity: 1, scale: 0.5, y: 0 }}
            animate={{ opacity: 0, scale: 1.8, y: -24 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            onAnimationComplete={() => setBurst(0)}
            className="text-accent pointer-events-none absolute inset-0 grid place-items-center"
          >
            <ThumbsUp className="size-5 fill-current" />
          </m.span>
        )}
      </AnimatePresence>
    </div>
  );
}
