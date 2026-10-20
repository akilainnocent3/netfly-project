"use client";

import { AnimatePresence, m } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { useInList, useMyListToggle, usePendingFor } from "@/lib/queries";
import type { TitleCard } from "@/lib/types";
import { IconButton } from "../ui/button";

export function MyListButton({
  title,
  size = "md",
  initial,
}: {
  title: Pick<TitleCard, "id" | "slug" | "title" | "in_my_list">;
  size?: "sm" | "md" | "lg";
  initial?: boolean | null;
}) {
  const local = useInList();
  const toggle = useMyListToggle(title);
  const pending = usePendingFor("mylist", title.id);
  const inList =
    (local.data && title.id in local.data ? local.data[title.id] : (initial ?? title.in_my_list)) ??
    false;
  return (
    <IconButton
      size={size}
      label={inList ? "Remove from My List" : "Add to My List"}
      aria-pressed={inList}
      loading={pending}
      onClick={() => toggle.toggleNow(!inList)}
      className={inList ? "border-white bg-white/15" : undefined}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={String(inList)}
          className="grid place-items-center"
          initial={{ scale: 0.4, rotate: -90, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {inList ? <Check strokeWidth={2.6} /> : <Plus strokeWidth={2.6} />}
        </m.span>
      </AnimatePresence>
    </IconButton>
  );
}
