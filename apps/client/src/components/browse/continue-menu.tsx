"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Info, MoreHorizontal, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  removeFromHome,
  useHideFromContinueWatching,
  usePendingFor,
  useRate,
  useRatings,
} from "@/lib/queries";
import type { TitleCard } from "@/lib/types";
import { IconButton } from "../ui/button";

const ITEM =
  "text-meta flex h-10 cursor-pointer items-center gap-3 rounded px-3 text-white/90 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-white/10";

/** Continue Watching "⋯": Episodes & info, Rate, Remove from row. */
export function ContinueMenu({
  title,
  className,
  onAction,
  onOpenChange,
}: {
  title: TitleCard;
  className?: string;
  onAction?: () => void;
  /** The hover card stays open while this menu (rendered in a portal) is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hide = useHideFromContinueWatching(title);
  const rate = useRate(title);
  const ratings = useRatings();
  const ratePending = usePendingFor("rate", title.id);
  const current =
    (ratings.data && title.id in ratings.data ? ratings.data[title.id] : title.rating) ?? null;
  const setRating = (value: -1 | 1 | 2) => {
    const next = current === value ? null : value;
    rate.rateNow({ value: next, previous: current as -1 | 1 | 2 | null });
    if (next === -1) removeFromHome(queryClient, title.id);
    onAction?.();
  };
  return (
    <DropdownMenu.Root modal={false} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        <IconButton
          size="sm"
          label={`More options for ${title.title}`}
          className={className}
          loading={hide.isPending}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <MoreHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          onClick={(e) => e.stopPropagation()}
          className="z-[90] w-56 rounded-md border border-white/10 bg-[#232323] p-1.5 shadow-2xl"
        >
          <DropdownMenu.Item
            className={ITEM}
            onSelect={() => {
              onAction?.();
              router.push(`/title/${title.slug}`, { scroll: false });
            }}
          >
            <Info className="size-4" /> {title.type === "series" ? "Episodes & info" : "More info"}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-white/10" />
          <DropdownMenu.Label className="text-caption px-3 py-1 text-[#808080] uppercase">
            Rate
          </DropdownMenu.Label>
          <DropdownMenu.Item className={ITEM} disabled={ratePending} onSelect={() => setRating(-1)}>
            <ThumbsDown className="size-4" /> Not for me {current === -1 && "✓"}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} disabled={ratePending} onSelect={() => setRating(1)}>
            <ThumbsUp className="size-4" /> I like this {current === 1 && "✓"}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} disabled={ratePending} onSelect={() => setRating(2)}>
            <ThumbsUp className="size-4 fill-current" /> Love this! {current === 2 && "✓"}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-white/10" />
          <DropdownMenu.Item
            className={ITEM}
            disabled={hide.isPending}
            onSelect={() => {
              hide.hideNow();
              onAction?.();
            }}
          >
            <X className="size-4" /> Remove from row
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
