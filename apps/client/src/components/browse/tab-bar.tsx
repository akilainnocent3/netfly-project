"use client";

import { cn } from "@netfly/ui";
import { Bookmark, Grid2x2, House, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/browse", label: "Home", icon: House },
  { href: "/categories", label: "Categories", icon: Grid2x2 },
  { href: "/search", label: "Search", icon: Search },
  { href: "/my-list", label: "My List", icon: Bookmark },
  { href: "/account", label: "Account", icon: UserRound },
];

/** Phone navigation. The translation switcher stays top-center in the header. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/8 bg-bg/92 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid h-16 grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-white" : "text-white/55")}>
                <Icon className={cn("size-[22px]", active && "text-accent")} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
