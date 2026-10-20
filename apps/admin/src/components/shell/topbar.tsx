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
    <header className="border-line bg-bg/85 sticky top-0 z-40 flex h-12 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
      <button
        type="button"
        onClick={onOpenPalette}
        className="border-line bg-panel text-subtle hover:border-fg/20 flex h-8 w-full max-w-[340px] items-center gap-2 rounded-md border px-2.5 text-[13px]"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="border-line rounded border px-1 text-[11px]">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label={`Theme: ${mode}`}
          onClick={() => setMode(mode === "system" ? "dark" : mode === "dark" ? "light" : "system")}
          className="text-muted hover:bg-hover hover:text-fg grid size-8 place-items-center rounded-md"
        >
          <ThemeIcon className="size-4" />
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            className="hover:bg-hover flex h-8 items-center gap-2 rounded-md px-1.5"
            aria-label="Account menu"
          >
            <span className="bg-accent/15 text-accent grid size-6 place-items-center rounded-full text-[11px] font-semibold">
              {user?.full_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-[13px] sm:inline">{user?.full_name}</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="border-line bg-panel z-50 min-w-48 rounded-lg border p-1 shadow-xl"
            >
              <div className="text-muted px-2.5 py-2 text-[12px]">
                @{user?.username} · {user?.role?.replace("_", " ")}
              </div>
              <DropdownMenu.Separator className="bg-line my-1 h-px" />
              <DropdownMenu.Item
                onSelect={() => void signOut()}
                className="data-[highlighted]:bg-hover flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] outline-none"
              >
                <LogOut className="text-subtle size-4" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
