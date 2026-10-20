"use client";

import { cn } from "@netfly/ui";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Search, Settings, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "../brand/logo";
import { useAuth } from "../providers/auth";
import { TranslationSwitcher } from "./translation-switcher";

const NAV = [
  { href: "/browse", label: "Home" },
  { href: "/categories", label: "Categories" },
  { href: "/my-list", label: "My List" },
];

export function Header() {
  const pathname = usePathname();
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,box-shadow] duration-300",
        solid ? "bg-bg/92 shadow-[0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-xl" : "bg-gradient-to-b from-black/75 via-black/30 to-transparent",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="relative flex h-[var(--header-h)] items-center gap-6 px-[max(4vw,16px)]">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-5 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn("text-[14px] transition-colors", pathname.startsWith(item.href) ? "font-semibold text-white" : "text-white/70 hover:text-white")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <TranslationSwitcher compact />
        </div>
        <div className="ml-auto flex items-center gap-2 md:gap-4">
          <SearchBox />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onSearchPage = pathname.startsWith("/search");
  const [open, setOpen] = useState(onSearchPage);
  const [value, setValue] = useState(onSearchPage ? (params.get("q") ?? "") : "");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!onSearchPage) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      if ((params.get("q") ?? "") !== value.trim()) router.replace(`/search?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, onSearchPage, params, router]);

  return (
    <div className="hidden items-center md:flex">
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.div
            key="open"
            initial={{ width: 36, opacity: 0.6 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 36, opacity: 0 }}
            className="flex h-9 items-center gap-2 overflow-hidden rounded-md border border-white/25 bg-black/70 px-2.5"
          >
            <Search className="size-4 shrink-0 text-white/70" />
            <input
              ref={input}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (!onSearchPage && e.target.value) router.push(`/search?q=${encodeURIComponent(e.target.value)}`);
              }}
              onBlur={() => !value && !onSearchPage && setOpen(false)}
              onKeyDown={(e) => e.key === "Escape" && (setValue(""), setOpen(false))}
              placeholder="Titles, people, genres"
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/45"
            />
            {value && (
              <button type="button" aria-label="Clear search" onClick={() => setValue("")} className="text-white/60 hover:text-white">
                <X className="size-4" />
              </button>
            )}
          </motion.div>
        ) : (
          <motion.button key="closed" type="button" aria-label="Search" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-full text-white/90 hover:bg-white/10">
            <Search className="size-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileMenu() {
  const { user, signOut } = useAuth();
  const initial = user?.full_name.slice(0, 1).toUpperCase() ?? "";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Account menu" className="grid size-9 place-items-center rounded-md bg-gradient-to-br from-accent to-[color-mix(in_oklab,var(--accent)_40%,#1e1b4b)] text-[14px] font-bold text-accent-fg ring-white/0 transition hover:ring-2 hover:ring-white/40">
        {initial || <User className="size-4" />}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="z-[70] w-60 rounded-xl border border-white/10 bg-surface/95 p-1.5 text-[14px] shadow-2xl backdrop-blur-xl">
          <div className="px-3 py-2.5">
            <p className="font-semibold">{user?.full_name}</p>
            <p className="text-[13px] text-muted">@{user?.username}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
          <DropdownMenu.Item asChild>
            <Link href="/account" className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 outline-none data-[highlighted]:bg-white/8">
              <Settings className="size-4 text-muted" /> Account & playback
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => void signOut()} className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 outline-none data-[highlighted]:bg-white/8">
            <LogOut className="size-4 text-muted" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
