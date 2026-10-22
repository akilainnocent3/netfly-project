"use client";

import { cn } from "@netfly/ui";
import { Bookmark, Flame, House, LogIn, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Avatar } from "../profiles/avatar";
import { useAuth } from "../providers/auth";
import { useProfiles } from "../providers/profile";

const TABS = [
  { href: "/browse", label: "Home", icon: House, also: ["/series", "/films", "/categories"] },
  { href: "/new-and-popular", label: "New & Hot", icon: Flame, also: [] },
  { href: "/search", label: "Search", icon: Search, also: [] },
  { href: "/my-list", label: "My List", icon: Bookmark, also: [] },
  { href: "/account", label: "Profile", icon: UserRound, also: [] },
];

// Set by the bar itself (server-rendered, so no layout shift), not by `:root:has([data-tabbar])`:
// a :has() on the root that depends on the whole subtree is re-checked on DOM changes.
const TABBAR_SIZE =
  ":root{--tabbar-h:calc(64px + env(safe-area-inset-bottom))}" +
  "@media (width>=64rem){:root{--tabbar-h:0px}}";

/** Typing into a field on a phone: the on-screen keyboard is (almost certainly) up. */
function editableFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  return (
    el instanceof HTMLInputElement &&
    !/^(checkbox|radio|button|submit|range|file|color)$/.test(el.type)
  );
}

/**
 * Sets `<html data-keyboard>` while the on-screen keyboard is open, which hides the tab bar
 * (and zeroes `--tabbar-h`) so it can't ride up over the search field and results. While a field
 * has focus on a touch screen, either signal counts: the visual viewport much shorter than the
 * layout viewport (iOS, and Android without `interactive-widget=resizes-content`), or — with
 * resizes-content, where both shrink — the layout viewport much shorter than its tallest height in
 * this orientation.
 */
function useKeyboardFlag(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    let tallest = window.innerHeight;
    // The screen's orientation, not the viewport's: a keyboard can make the viewport wider than tall.
    const isLandscape = () =>
      screen.orientation?.type.startsWith("landscape") ?? screen.width > screen.height;
    let orientation = isLandscape();
    const update = () => {
      const landscape = isLandscape();
      if (landscape !== orientation) {
        orientation = landscape;
        tallest = window.innerHeight;
      }
      tallest = Math.max(tallest, window.innerHeight);
      // A keyboard only opens for a focused field (this also ignores pinch zoom, which shrinks
      // the visual viewport too).
      const open =
        editableFocused() &&
        matchMedia("(pointer: coarse)").matches &&
        ((!!vv && window.innerHeight - vv.height * vv.scale > 150) ||
          tallest - window.innerHeight > 150);
      document.documentElement.toggleAttribute("data-keyboard", open);
    };
    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      document.documentElement.removeAttribute("data-keyboard");
    };
  }, [enabled]);
}

/**
 * Phone navigation (below `lg`), always one tap away: the title modal renders a second copy inside
 * its dialog (`inModal`) so it stays usable there. Its height is `--tabbar-h` (globals.css); pages
 * end with `pb-tabbar` and floating UI sits above it.
 *
 * It must stay `position: fixed` relative to the viewport, so no ancestor may get `transform`,
 * `filter`, `perspective`, `contain: paint` or `will-change: transform` — each of those makes
 * `fixed` relative to that ancestor instead (mobile.spec.ts checks the bar stays at the bottom).
 */
export function TabBar({ inModal = false }: { inModal?: boolean }) {
  const pathname = usePathname();
  const { active } = useProfiles();
  const { status } = useAuth();
  useKeyboardFlag(!inModal);
  // Signed out: My List and Profile need an account, so the last tab is Sign In.
  const tabs =
    status === "anonymous"
      ? [
          ...TABS.slice(0, 3),
          {
            href: `/login?next=${encodeURIComponent(pathname)}`,
            label: "Sign In",
            icon: LogIn,
            also: [] as string[],
          },
        ]
      : TABS;
  return (
    <nav
      aria-label="Primary"
      data-tabbar={inModal ? "modal" : ""}
      className="tabbar bg-bg/92 fixed inset-x-0 bottom-0 z-50 border-t border-white/8 backdrop-blur-xl lg:hidden"
    >
      {inModal ? null : <style>{TABBAR_SIZE}</style>}
      <ul className={cn("grid h-16", tabs.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {tabs.map(({ href, label, icon: Icon, also }) => {
          const current = !inModal && [href, ...also].some((h) => pathname.startsWith(h));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "text-caption flex h-full flex-col items-center justify-center gap-1 font-medium transition-colors",
                  current ? "text-white" : "text-[#808080]",
                )}
              >
                {href === "/account" && active ? (
                  <Avatar
                    avatarKey={active.avatar_key}
                    className={cn("size-[22px] rounded-sm", current && "ring-2 ring-white")}
                  />
                ) : (
                  <Icon className="size-[22px]" strokeWidth={current ? 2.4 : 1.8} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Height of the visible tab bar in px (0 on desktop or while hidden), for popovers whose
 * collision padding has to be a number (Radix `collisionPadding`). Call while rendering open content.
 */
export function tabBarInset(): number {
  if (typeof document === "undefined") return 0;
  const bar = document.querySelector<HTMLElement>("[data-tabbar]");
  if (!bar || getComputedStyle(bar).visibility === "hidden") return 0;
  return bar.getBoundingClientRect().height;
}
