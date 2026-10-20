"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useAuth } from "../providers/auth";

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const initial = user?.full_name.slice(0, 1).toUpperCase() ?? "";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        className="from-accent text-accent-fg grid size-9 place-items-center rounded-md bg-gradient-to-br to-[color-mix(in_oklab,var(--accent)_40%,#1e1b4b)] text-[14px] font-bold ring-white/0 transition hover:ring-2 hover:ring-white/40"
      >
        {initial || <User className="size-4" />}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="bg-surface/95 z-[70] w-60 rounded-xl border border-white/10 p-1.5 text-[14px] shadow-2xl backdrop-blur-xl"
        >
          <div className="px-3 py-2.5">
            <p className="font-semibold">{user?.full_name}</p>
            <p className="text-muted text-[13px]">@{user?.username}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
          <DropdownMenu.Item asChild>
            <Link
              href="/account"
              className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 outline-none data-[highlighted]:bg-white/8"
            >
              <Settings className="text-muted size-4" /> Account & playback
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 outline-none data-[highlighted]:bg-white/8"
          >
            <LogOut className="text-muted size-4" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
