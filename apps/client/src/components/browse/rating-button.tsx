"use client";

import { cn } from "@netfly/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, m } from "framer-motion";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { removeFromHome, usePendingFor, useRate, useRatings } from "@/lib/queries";
import type { TitleCard } from "@/lib/types";
import { IconButton } from "../ui/button";
import { useToast } from "../ui/toast";

type Value = -1 | 1 | 2;
const CHOICES: Array<{ value: Value; label: string }> = [
  { value: -1, label: "Not for me" },
  { value: 1, label: "I like this" },
  { value: 2, label: "Love this!" },
];

function DoubleThumb() {
  return (
    <span className="relative inline-flex size-[1em]" aria-hidden>
      <ThumbsUp className="size-full" />
      <ThumbsUp className="absolute -top-[20%] -right-[35%] size-full opacity-90" />
    </span>
  );
}

function Icon({ value }: { value: Value | null }) {
  if (value === -1) return <ThumbsDown />;
  if (value === 2) return <DoubleThumb />;
  return <ThumbsUp />;
}

/** One thumb that blooms into 👎 · 👍 · 👍👍. Optimistic, single-flight per title, rolls back on error. */
export function RatingButton({
  title,
  size = "md",
  onDisliked,
}: {
  title: Pick<TitleCard, "id" | "slug" | "title" | "rating">;
  size?: "sm" | "md" | "lg";
  onDisliked?: () => void;
}) {
  const ratings = useRatings();
  const rate = useRate(title);
  const pending = usePendingFor("rate", title.id);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const raw = ratings.data && title.id in ratings.data ? ratings.data[title.id] : title.rating;
  const current: Value | null = raw === -1 || raw === 1 || raw === 2 ? raw : null;

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  // Close on Escape or a tap elsewhere (touch has no mouseleave).
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
    if (pending) return;
    const next = current === value ? null : value;
    rate.rateNow({ value: next, previous: current });
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
            rate.rateNow({ value: current, previous: -1 });
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
        if (!pending) setOpen(true);
      }}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setOpen(false), 250);
      }}
    >
      <IconButton
        size={size}
        loading={pending}
        label={
          current
            ? `Rated: ${CHOICES.find((c) => c.value === current)?.label}. Change rating`
            : "Rate this title"
        }
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={current ? "border-white bg-white/15" : undefined}
      >
        <Icon value={current} />
      </IconButton>
      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: "spring", stiffness: 520, damping: 30 }}
            className="bg-elevated absolute top-1/2 left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full p-1.5 shadow-[0_10px_40px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
          >
            {CHOICES.map((choice) => (
              <IconButton
                key={choice.value}
                variant="ghost"
                size={size}
                role="menuitemradio"
                aria-checked={current === choice.value}
                label={choice.label}
                onClick={() => choose(choice.value)}
                className={cn("hover:scale-110", current === choice.value && "bg-white/20")}
              >
                <Icon value={choice.value} />
              </IconButton>
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
