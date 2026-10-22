"use client";

import { cn, NavPending } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Logo } from "../brand/logo";
import { useAuth } from "../providers/auth";
import { BackButton } from "../ui/back-button";
import { Button, IconButton } from "../ui/button";
import { LinkPending } from "../ui/link-pending";
import { useRouteChangePending } from "@/lib/use-navigate";
import { TranslationSwitcher } from "./translation-switcher";
import { tabBarInset } from "./tab-bar";

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

/** My List needs an account: it isn't offered to signed-out visitors. */
export function navFor(signedIn: boolean) {
  return signedIn ? NAV : NAV.filter((item) => item.href !== "/my-list");
}

const noopSubscribe = () => () => {};

/** Nested pages: on phones the header leads with a back chevron (the tab bar does top-level jumps). */
function isSubPage(pathname: string, query: string | null): boolean {
  return (
    /^\/(categories|title)\/[^/]+/.test(pathname) ||
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    (pathname === "/search" && !!query)
  );
}

export function Header() {
  const pathname = usePathname();
  const params = useSearchParams();
  const sub = isSubPage(pathname, params.get("q"));
  // The header hydrates late (inside a Suspense boundary), often after the session refresh has
  // settled: render what the server saw ("loading") until hydration is done, then the real status.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const auth = useAuth();
  const status = hydrated ? auth.status : "loading";
  const nav = navFor(status !== "anonymous");
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
      <div className="relative flex h-[var(--header-h)] items-center gap-4 px-[max(4vw,16px)] max-[359px]:gap-2 max-[359px]:px-3 xl:gap-7">
        {sub && <BackButton className="md:hidden" />}
        <Logo className={sub ? "max-md:hidden" : undefined} />
        <nav aria-label="Primary" className="hidden items-center gap-5 xl:flex">
          {nav.map((item) => (
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
              <LinkPending>{item.label}</LinkPending>
            </Link>
          ))}
        </nav>
        <CompactNav pathname={pathname} nav={nav} />
        <div className="ml-auto flex items-center gap-1.5 max-[359px]:gap-1 md:gap-3">
          <TranslationSwitcher compact />
          <SearchBox />
          {status === "anonymous" ? (
            <SignInButton />
          ) : (
            <>
              <NotificationsBell />
              <ProfileMenu />
            </>
          )}
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
      className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:hidden"
    >
      {CHIPS.map((chip) => (
        // A 44 px tap target around the 36 px chip.
        <Link
          key={chip.href}
          href={chip.href}
          aria-current={isActive(pathname, chip.href) ? "page" : undefined}
          className="group inline-flex h-11 shrink-0 items-center"
        >
          <span
            className={cn(
              "text-meta inline-flex h-9 items-center rounded-full border px-4 font-semibold",
              isActive(pathname, chip.href)
                ? "border-white bg-white text-black"
                : "border-white/50 text-white",
            )}
          >
            <LinkPending>{chip.label}</LinkPending>
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Signed out: the red Sign In button where the profile menu would be. Comes back here after. */
function SignInButton() {
  const pathname = usePathname();
  const params = useSearchParams();
  const here = `${pathname}${params.size ? `?${params}` : ""}`;
  return (
    <Button asChild variant="accent" size="sm" className="h-8 rounded px-4 font-semibold">
      <Link href={`/login?next=${encodeURIComponent(here)}`}>Sign In</Link>
    </Button>
  );
}

/** Below xl the destinations collapse into a "Browse" menu (phones use the tab bar). */
function CompactNav({ pathname, nav }: { pathname: string; nav: typeof NAV }) {
  const current = nav.find((item) => isActive(pathname, item.href));
  // The menu closes (and its links unmount) on select, so the trigger carries the loader.
  const leaving = useRouteChangePending();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="text-meta hidden items-center gap-1 font-semibold text-white outline-none focus-visible:outline-2 focus-visible:outline-white md:flex xl:hidden">
        <NavPending pending={leaving.pending}>{current?.label ?? "Browse"}</NavPending>{" "}
        <ChevronDown className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="center"
          sideOffset={14}
          collisionPadding={{ bottom: tabBarInset() + 8, top: 8 }}
          className="z-[70] w-60 border-t-2 border-white bg-black/90 py-2 text-center shadow-2xl"
        >
          {nav.map((item) => (
            <DropdownMenu.Item key={item.href} asChild>
              <Link
                href={item.href}
                onClick={() => {
                  if (!isActive(pathname, item.href)) leaving.mark();
                }}
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

/**
 * Netflix's desktop search: the icon opens a square, white-bordered box. The first keystroke
 * from another page goes to /search (one history entry); after that the URL is replaced as you
 * type. Clearing it returns to the page you came from; Esc closes it, and so does clicking
 * outside while it's empty.
 */
function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onSearch = pathname.startsWith("/search");
  const urlQuery = onSearch ? (params.get("q") ?? "") : "";
  // On /search (even before typing) the box is open: it's the page's search field.
  const [open, setOpen] = useState(onSearch);
  const [value, setValue] = useState(urlQuery);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  /** Where the first keystroke came from (we pushed /search on top of it). */
  const origin = useRef<string | null>(null);
  const written = useRef(urlQuery);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Follow URL changes made elsewhere (a related term, Back) — never the echo of our own typing.
  useEffect(() => {
    if (onSearch) {
      setOpen(true);
      if (urlQuery !== written.current) {
        written.current = urlQuery;
        setValue(urlQuery);
      }
    } else if (!pathname.startsWith("/title/")) {
      // Left search for another page (a title modal over the results keeps the box as it is).
      origin.current = null;
      written.current = "";
      setValue("");
      setOpen(false);
    }
  }, [onSearch, urlQuery, pathname]);

  // While on /search, replace the URL as you type (debounced).
  useEffect(() => {
    if (!onSearch) return;
    const q = value.trim();
    if (q === (params.get("q") ?? "") || (!q && !written.current)) return;
    const timer = setTimeout(() => {
      if (!q) {
        // Cleared: back to the page the search started from.
        written.current = "";
        if (origin.current) {
          origin.current = null;
          router.back();
        } else router.replace("/search", { scroll: false });
        return;
      }
      written.current = q;
      const next = new URLSearchParams(params.toString());
      next.set("q", q);
      router.replace(`/search?${next.toString()}`, { scroll: false });
    }, 180);
    return () => clearTimeout(timer);
  }, [value, onSearch, params, router]);

  // Clicking outside an empty box closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!value && box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, value]);

  const onType = (next: string) => {
    setValue(next);
    if (!onSearch && next.trim() && origin.current === null) {
      // The first keystroke elsewhere: one history entry, right away (later keystrokes, even
      // before the page has switched, only update the box; /search then replaces the URL).
      origin.current = `${pathname}${params.size ? `?${params}` : ""}`;
      written.current = next.trim();
      router.push(`/search?q=${encodeURIComponent(next.trim())}`, { scroll: false });
    }
  };

  return (
    <div ref={box} className="hidden items-center md:flex">
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <m.div
            key="open"
            initial={{ width: 36 }}
            animate={{ width: 280 }}
            exit={{ width: 36, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            data-testid="search-box"
            className="flex h-9 items-center gap-2 overflow-hidden border border-white bg-black/75 px-2"
          >
            <Search className="size-5 shrink-0 text-white" aria-hidden />
            <input
              ref={input}
              value={value}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") return;
                setValue("");
                setOpen(false);
              }}
              type="search"
              enterKeyHint="search"
              placeholder="Titles, people, genres"
              aria-label="Search"
              className="text-body min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-[#b3b3b3] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {value ? (
              <IconButton
                variant="ghost"
                size="sm"
                label="Clear search"
                className="size-7 rounded-none hover:bg-transparent"
                onClick={() => {
                  setValue("");
                  input.current?.focus();
                }}
              >
                <X />
              </IconButton>
            ) : null}
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
