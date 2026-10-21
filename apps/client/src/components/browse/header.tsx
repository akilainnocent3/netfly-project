"use client";

import { cn } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "../brand/logo";
import { IconButton } from "../ui/button";
import { TranslationSwitcher } from "./translation-switcher";

// The account menu (Radix) isn't needed for first paint: load it after hydration.
const ProfileMenu = dynamic(() => import("./profile-menu").then((m) => m.ProfileMenu), {
  ssr: false,
  loading: () => <span aria-hidden className="block size-9 rounded-md bg-white/10" />,
});

const NotificationsBell = dynamic(
  () => import("./notifications").then((m) => m.NotificationsBell),
  {
    ssr: false,
    loading: () => <span aria-hidden className="block size-9" />,
  },
);

export const NAV = [
  { href: "/browse", label: "Home" },
  { href: "/series", label: "Series" },
  { href: "/films", label: "Films" },
  { href: "/new-and-popular", label: "New & Popular" },
  { href: "/my-list", label: "My List" },
  { href: "/categories", label: "Categories" },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
        solid ? "bg-bg" : "bg-gradient-to-b from-black/75 via-black/30 to-transparent",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="relative flex h-[var(--header-h)] items-center gap-4 px-[max(4vw,16px)] xl:gap-7">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-5 xl:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "text-meta transition-colors duration-300",
                isActive(pathname, item.href)
                  ? "font-bold text-white"
                  : "text-[#e5e5e5] hover:text-[#b3b3b3]",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <CompactNav pathname={pathname} />
        <div className="ml-auto flex items-center gap-1.5 md:gap-3">
          <TranslationSwitcher compact />
          <SearchBox />
          <NotificationsBell />
          <ProfileMenu />
        </div>
      </div>
      <MobileChips pathname={pathname} />
    </header>
  );
}

const CHIPS = [
  { href: "/series", label: "Series" },
  { href: "/films", label: "Films" },
  { href: "/categories", label: "Categories" },
];

/** Phones: Netflix-style chips under the bar on the home pages (the tab bar holds the rest). */
function MobileChips({ pathname }: { pathname: string }) {
  if (!["/browse", "/series", "/films"].includes(pathname)) return null;
  return (
    <nav
      aria-label="Browse by type"
      className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5 md:hidden"
    >
      {CHIPS.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          aria-current={isActive(pathname, chip.href) ? "page" : undefined}
          className={cn(
            "text-meta inline-flex h-9 shrink-0 items-center rounded-full border px-4 font-semibold",
            isActive(pathname, chip.href)
              ? "border-white bg-white text-black"
              : "border-white/50 text-white",
          )}
        >
          {chip.label}
        </Link>
      ))}
    </nav>
  );
}

/** Below xl the six destinations collapse into a "Browse" menu (phones use the tab bar). */
function CompactNav({ pathname }: { pathname: string }) {
  const current = NAV.find((item) => isActive(pathname, item.href));
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="text-meta hidden items-center gap-1 font-semibold text-white outline-none focus-visible:outline-2 focus-visible:outline-white md:flex xl:hidden">
        {current?.label ?? "Browse"} <ChevronDown className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="center"
          sideOffset={14}
          className="z-[70] w-60 border-t-2 border-white bg-black/90 py-2 text-center shadow-2xl"
        >
          {NAV.map((item) => (
            <DropdownMenu.Item key={item.href} asChild>
              <Link
                href={item.href}
                className={cn(
                  "text-meta block h-11 leading-[44px] outline-none data-[highlighted]:bg-white/8",
                  isActive(pathname, item.href) ? "font-bold text-white" : "text-[#b3b3b3]",
                )}
              >
                {item.label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
    }, 200);
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
              type="search"
              enterKeyHint="search"
              placeholder="Titles, people, genres"
              aria-label="Search"
              className="text-body min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/45 [&::-webkit-search-cancel-button]:hidden"
            />
            {value && (
              <IconButton
                variant="ghost"
                size="sm"
                label="Clear search"
                onClick={() => setValue("")}
              >
                <X />
              </IconButton>
            )}
          </m.div>
        ) : (
          <m.div key="closed">
            <IconButton variant="ghost" label="Search" onClick={() => setOpen(true)}>
              <Search />
            </IconButton>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
