"use client";

import { cn, NavPending } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { Clapperboard, Cpu, Gauge, Menu, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useRouteChangePending } from "@/lib/use-pending";
import { useAuth } from "../providers/auth";
import { LinkPending } from "../ui/link-pending";
import { NAV, type NavItem } from "./nav";

/** The sections staff use most on a phone; everything else is under "More". */
const PRIMARY: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/titles", label: "Titles", icon: Clapperboard },
  { href: "/transcoding", label: "Jobs", icon: Cpu },
  { href: "/users", label: "Users", icon: Users },
];

// Rendered by the bar (server-side, no layout shift) rather than a `:root:has()` rule.
const TABBAR_SIZE =
  ":root{--tabbar-h:calc(64px + env(safe-area-inset-bottom))}" +
  "@media (width>=48rem){:root{--tabbar-h:0px}}";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Below `md` the sidebar is hidden: a bottom tab bar with the main sections plus "More" (a sheet
 * with every section the role can open). Its height is `--tabbar-h` (globals.css), which pages
 * and floating panels use to stay clear of it.
 *
 * Keep it `position: fixed` relative to the viewport: no ancestor may get `transform`, `filter`,
 * `perspective`, `contain: paint` or `will-change: transform`.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { can } = useAuth();
  const [more, setMore] = useState(false);
  // The sheet closes (unmounting its links) on select, so the More tab carries the loader.
  const leaving = useRouteChangePending();
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.roles || can(...item.roles)),
  })).filter((g) => g.items.length);
  const moreActive = !PRIMARY.some((item) => isActive(pathname, item.href));

  const tab = "flex h-full flex-col items-center justify-center gap-1 text-[12px] font-medium";
  return (
    <>
      <nav
        aria-label="Main"
        data-tabbar
        className="border-line bg-panel/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <style>{TABBAR_SIZE}</style>
        <ul className="grid h-16 grid-cols-5">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(tab, active ? "text-fg" : "text-muted")}
                >
                  <LinkPending className="[--nf-pending-size:20px]">
                    <item.icon className={cn("size-5", active && "text-accent")} />
                  </LinkPending>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-haspopup="dialog"
              className={cn(tab, "w-full", moreActive ? "text-fg" : "text-muted")}
            >
              <NavPending pending={leaving.pending} className="[--nf-pending-size:20px]">
                <Menu className={cn("size-5", moreActive && "text-accent")} />
              </NavPending>
              More
            </button>
          </li>
        </ul>
      </nav>
      <Dialog.Root open={more} onOpenChange={setMore}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/40 md:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="border-line bg-panel fixed inset-x-0 bottom-0 z-[151] max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t px-3 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl md:hidden"
          >
            <div className="flex items-center justify-between px-2 py-2">
              <Dialog.Title className="text-[15px] font-semibold">All sections</Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="text-muted hover:bg-hover grid size-11 place-items-center rounded-md"
              >
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <nav aria-label="All sections" className="space-y-4 pb-2">
              {groups.map((group) => (
                <div key={group.section}>
                  <p className="text-subtle px-2 pb-1 text-[12px] font-medium tracking-wider uppercase">
                    {group.section}
                  </p>
                  <ul>
                    {group.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            onClick={() => {
                              if (!active) leaving.mark();
                              setMore(false);
                            }}
                            className={cn(
                              "flex h-11 items-center gap-3 rounded-md px-2 text-[14px]",
                              active ? "bg-hover text-fg font-medium" : "text-muted",
                            )}
                          >
                            <item.icon className={cn("size-5", active && "text-accent")} />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
