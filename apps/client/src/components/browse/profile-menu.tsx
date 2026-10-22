"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Pencil, Settings, User } from "lucide-react";
import Link from "next/link";
import { UsageMenuLine, useUsageLine } from "../billing/usage-ring";
import { Avatar } from "../profiles/avatar";
import { useAuth } from "../providers/auth";
import { useProfiles } from "../providers/profile";
import { Button } from "../ui/button";
import { Pressable } from "../ui/pressable";
import { tabBarInset } from "./tab-bar";

const ITEM =
  "text-meta flex h-10 cursor-pointer items-center gap-3 px-3 text-white/85 outline-none data-[highlighted]:underline";

/** Account menu; with profiles on it is also the profile switcher. */
export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const p = useProfiles();
  const initial = user?.full_name.slice(0, 1).toUpperCase() ?? "";
  const others = p.profiles.filter((profile) => profile.id !== p.active?.id);
  const usage = useUsageLine();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {p.enabled && p.active ? (
          <Pressable
            aria-label={`Profile menu, watching as ${p.active.name}`}
            className="group flex items-center gap-1.5 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-white pointer-coarse:min-h-11"
          >
            <Avatar avatarKey={p.active.avatar_key} className="size-8 rounded" />
            <ChevronDown className="hidden size-4 text-white transition-transform duration-200 group-data-[state=open]:rotate-180 md:block" />
          </Pressable>
        ) : (
          <Button
            variant="accent"
            size="sm"
            aria-label="Account menu"
            className="text-body size-9 rounded-md !px-0"
          >
            {initial || <User className="size-4" />}
          </Button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={12}
          collisionPadding={{ bottom: tabBarInset() + 8, top: 8 }}
          className="z-[70] max-h-[var(--radix-dropdown-menu-content-available-height)] w-60 overflow-y-auto border border-white/15 bg-black/92 py-2 shadow-2xl backdrop-blur"
        >
          {p.enabled ? (
            <>
              {others.map((profile) => (
                <DropdownMenu.Item
                  key={profile.id}
                  onSelect={() => p.choose(profile)}
                  className={ITEM}
                >
                  <Avatar avatarKey={profile.avatar_key} className="size-8 rounded" />
                  {profile.name}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item onSelect={() => p.openGate("manage")} className={ITEM}>
                <Pencil className="size-4 text-white/60" /> Manage Profiles
              </DropdownMenu.Item>
            </>
          ) : (
            <div className="px-3 py-2">
              <p className="text-body font-semibold">{user?.full_name}</p>
              <p className="text-muted text-meta">@{user?.username}</p>
            </div>
          )}
          {usage ? (
            <DropdownMenu.Item asChild>
              <UsageMenuLine line={usage} className="h-9 px-3 data-[highlighted]:underline" />
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item asChild>
            <Link href="/account" className={ITEM}>
              <Settings className="size-4 text-white/60" /> Account
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-2 h-px bg-white/15" />
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="text-meta flex h-10 cursor-pointer items-center justify-center gap-2 text-white/85 outline-none data-[highlighted]:underline"
          >
            <LogOut className="size-4" /> Sign out of Netfly
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
