"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useAuth } from "../providers/auth";
import { Button } from "../ui/button";

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const initial = user?.full_name.slice(0, 1).toUpperCase() ?? "";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="accent"
          size="sm"
          aria-label="Account menu"
          className="text-body size-9 rounded-md !px-0"
        >
          {initial || <User className="size-4" />}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="bg-surface/95 text-body z-[70] w-60 rounded-xl border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          <div className="px-3 py-2.5">
            <p className="font-semibold">{user?.full_name}</p>
            <p className="text-muted text-meta">@{user?.username}</p>
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
