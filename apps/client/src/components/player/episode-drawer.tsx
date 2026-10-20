"use client";

import { cn, formatRuntime } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { m } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useEpisodes } from "@/lib/queries";
import { NetflyImage } from "../ui/netfly-image";

/** Episode list inside the player (current season), current episode highlighted. */
export function EpisodeDrawer({
  open,
  onOpenChange,
  slug,
  season,
  currentEpisode,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slug: string;
  season: number;
  currentEpisode: number;
}) {
  const episodes = useEpisodes(slug, open ? season : null);
  const items = episodes.data?.pages.flatMap((p) => p.results) ?? [];
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => currentRef.current?.scrollIntoView({ block: "center" }), 50);
  }, [open, items.length]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/40" />
        <Dialog.Content aria-describedby={undefined} asChild>
          <m.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-[131] flex w-[min(460px,92vw)] flex-col bg-black/92 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <Dialog.Title className="text-[18px] font-bold">Season {season}</Dialog.Title>
              <Dialog.Close
                aria-label="Close episodes"
                className="grid size-9 place-items-center rounded-full hover:bg-white/10"
              >
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <ol className="flex-1 overflow-y-auto p-2">
              {items.map((ep) => (
                <li key={ep.id} ref={ep.id === currentEpisode ? currentRef : undefined}>
                  <Link
                    href={`/watch/${slug}?episode=${ep.id}`}
                    replace
                    onClick={() => onOpenChange(false)}
                    aria-current={ep.id === currentEpisode ? "true" : undefined}
                    className={cn(
                      "flex gap-3 rounded-lg p-3 transition-colors hover:bg-white/8",
                      ep.id === currentEpisode && "ring-accent/60 bg-white/10 ring-1",
                    )}
                  >
                    <div className="bg-surface relative aspect-video w-32 shrink-0 overflow-hidden rounded-md">
                      <NetflyImage
                        image={ep.thumbnail}
                        alt=""
                        sizes="128px"
                        className="object-cover"
                      />
                      {ep.progress > 0 && (
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
                          <div
                            className="bg-accent h-full"
                            style={{ width: `${ep.progress * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">
                        {ep.number}. {ep.name}
                      </p>
                      <p className="text-[12px] text-white/50">
                        {formatRuntime(ep.runtime_minutes)}
                        {ep.watched ? " · Watched" : ""}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12px] text-white/60">{ep.synopsis}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
