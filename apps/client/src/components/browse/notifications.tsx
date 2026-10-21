"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useMarkNotificationsSeen, useNotifications } from "@/lib/queries";
import { useAuth } from "../providers/auth";
import { IconButton } from "../ui/button";
import { NetflyImage } from "../ui/netfly-image";
import { Skeleton } from "../ui/skeleton";

function ago(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${days}d ago` : `${Math.round(days / 7)}w ago`;
}

/** The bell: released reminders, new episodes of saved series, recent arrivals. */
export function NotificationsBell() {
  const { status } = useAuth();
  const list = useNotifications(status === "authenticated");
  const seen = useMarkNotificationsSeen();
  const unread = list.data?.unread ?? 0;
  const items = list.data?.results ?? [];

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (open && unread > 0 && !seen.isPending) seen.mutate();
      }}
    >
      <DropdownMenu.Trigger asChild>
        <IconButton
          variant="ghost"
          label={unread ? `Notifications, ${unread} new` : "Notifications"}
          className="relative"
        >
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="bg-accent text-caption absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 leading-none font-bold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={12}
          className="z-[70] max-h-[min(70vh,560px)] w-[min(400px,calc(100vw-24px))] overflow-y-auto border-t-2 border-white bg-black/92 shadow-2xl backdrop-blur"
        >
          {list.isPending ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-meta text-muted p-6 text-center">No notifications yet.</p>
          ) : (
            items.map((n) => (
              <DropdownMenu.Item key={n.id} asChild>
                <Link
                  href={`/title/${n.title.slug}`}
                  scroll={false}
                  className="flex gap-3 border-b border-white/8 p-3 outline-none last:border-0 data-[highlighted]:bg-white/8"
                >
                  <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-sm bg-white/5">
                    <NetflyImage
                      image={n.title.backdrop ?? n.title.poster}
                      alt=""
                      sizes="112px"
                      className="object-cover"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-meta block font-semibold text-white">
                      {n.title.title}
                    </span>
                    <span className="text-meta block text-[#b3b3b3]">{n.message}</span>
                    <span className="text-caption mt-1 flex items-center gap-1.5 text-[#808080]">
                      {n.unread && <span className="bg-accent size-1.5 rounded-full" />}
                      {ago(n.at)}
                    </span>
                  </span>
                </Link>
              </DropdownMenu.Item>
            ))
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
