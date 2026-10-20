"use client";

import { cn } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import { Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "../brand/logo";
import { TranslationSwitcher } from "./translation-switcher";

// The account menu (Radix) isn't needed for first paint: load it after hydration.
const ProfileMenu = dynamic(() => import("./profile-menu").then((m) => m.ProfileMenu), {
  ssr: false,
  loading: () => <span aria-hidden className="block size-9 rounded-md bg-white/10" />,
});

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
        solid
          ? "bg-bg/92 shadow-[0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-xl"
          : "bg-gradient-to-b from-black/75 via-black/30 to-transparent",
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
              className={cn(
                "text-[14px] transition-colors",
                pathname.startsWith(item.href)
                  ? "font-semibold text-white"
                  : "text-white/70 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
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
      if ((params.get("q") ?? "") !== value.trim())
        router.replace(`/search?${next.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, onSearchPage, params, router]);

  return (
    <div className="hidden items-center md:flex">
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <m.div
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
                if (!onSearchPage && e.target.value)
                  router.push(`/search?q=${encodeURIComponent(e.target.value)}`);
              }}
              onBlur={() => !value && !onSearchPage && setOpen(false)}
              onKeyDown={(e) => e.key === "Escape" && (setValue(""), setOpen(false))}
              placeholder="Titles, people, genres"
              aria-label="Search"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/45"
            />
            {value && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setValue("")}
                className="text-white/60 hover:text-white"
              >
                <X className="size-4" />
              </button>
            )}
          </m.div>
        ) : (
          <m.button
            key="closed"
            type="button"
            aria-label="Search"
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-full text-white/90 hover:bg-white/10"
          >
            <Search className="size-5" />
          </m.button>
        )}
      </AnimatePresence>
    </div>
  );
}
