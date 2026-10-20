"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Monitor, Moon, Search, Sun } from "lucide-react";
import { useAuth } from "../providers/auth";
import { useTheme } from "../providers/theme";

export function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { user, signOut } = useAuth();
  const { mode, setMode } = useTheme();
  const ThemeIcon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-8 w-full max-w-[340px] items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-[13px] text-subtle hover:border-fg/20"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded border border-line px-1 text-[11px]">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label={`Theme: ${mode}`}
          onClick={() => setMode(mode === "system" ? "dark" : mode === "dark" ? "light" : "system")}
          className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-fg"
        >
          <ThemeIcon className="size-4" />
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-hover" aria-label="Account menu">
            <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
              {user?.full_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-[13px] sm:inline">{user?.full_name}</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-lg border border-line bg-panel p-1 shadow-xl">
              <div className="px-2.5 py-2 text-[12px] text-muted">
                @{user?.username} · {user?.role?.replace("_", " ")}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item onSelect={() => void signOut()} className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-hover">
                <LogOut className="size-4 text-subtle" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
