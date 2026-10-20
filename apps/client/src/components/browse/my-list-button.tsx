"use client";

import { cn } from "@netfly/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { useInList, useMyListToggle } from "@/lib/queries";
import type { TitleCard } from "@/lib/types";

export function MyListButton({ title, size = "md", initial }: { title: TitleCard; size?: "md" | "lg"; initial?: boolean | null }) {
  const local = useInList();
  const toggle = useMyListToggle();
  const inList = (local.data && title.id in local.data ? local.data[title.id] : (initial ?? title.in_my_list)) ?? false;
  const dim = size === "lg" ? "size-11" : "size-9";
  return (
    <button
      type="button"
      aria-pressed={inList}
      aria-label={inList ? "Remove from My List" : "Add to My List"}
      title={inList ? "Remove from My List" : "Add to My List"}
      onClick={() => toggle.mutate({ title, add: !inList })}
      className={cn("grid place-items-center rounded-full border-2 transition-colors", dim, inList ? "border-white bg-white/15" : "border-white/45 bg-black/40 hover:border-white")}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={String(inList)} initial={{ scale: 0.4, rotate: -90, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.18 }}>
          {inList ? <Check className={size === "lg" ? "size-5" : "size-[18px]"} strokeWidth={2.6} /> : <Plus className={size === "lg" ? "size-5" : "size-[18px]"} strokeWidth={2.6} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
