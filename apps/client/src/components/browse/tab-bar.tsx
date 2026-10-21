"use client";

import { cn } from "@netfly/ui";
import { Bookmark, Flame, House, LogIn, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

/** Phone navigation. The translation switcher stays top-center in the header. */
export function TabBar() {
  const pathname = usePathname();
  const { active } = useProfiles();
  const { status } = useAuth();
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
      className="bg-bg/92 fixed inset-x-0 bottom-0 z-50 border-t border-white/8 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className={cn("grid h-16", tabs.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {tabs.map(({ href, label, icon: Icon, also }) => {
          const current = [href, ...also].some((h) => pathname.startsWith(h));
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
