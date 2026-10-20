"use client";

import { cn } from "@netfly/ui";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../providers/auth";
import { useConfig } from "../providers/config";
import { NAV } from "./nav";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const config = useConfig();
  const name = config.str("branding.site_name", "NETFLY");

  return (
    <motion.aside
      animate={{ width: collapsed ? 56 : 232 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="border-line bg-panel sticky top-0 hidden h-dvh shrink-0 flex-col border-r md:flex"
    >
      <div className="flex h-12 items-center gap-2 px-3.5">
        <span className="bg-accent text-accent-fg grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-black">
          {name.slice(0, 1)}
        </span>
        {!collapsed && (
          <span className="truncate text-[13px] font-semibold">
            {name} <span className="text-muted font-normal">Studio</span>
          </span>
        )}
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2" aria-label="Main">
        {NAV.map((group) => {
          const items = group.items.filter((item) => !item.roles || can(...item.roles));
          if (!items.length) return null;
          return (
            <div key={group.section}>
              {!collapsed && (
                <p className="text-subtle px-2 pb-1 text-[11px] font-medium tracking-wider uppercase">
                  {group.section}
                </p>
              )}
              <ul className="space-y-px">
                {items.map((item) => {
                  const active =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                          active
                            ? "bg-hover text-fg font-medium"
                            : "text-muted hover:bg-hover hover:text-fg",
                        )}
                      >
                        <item.icon className={cn("size-4 shrink-0", active && "text-accent")} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="text-muted hover:bg-hover hover:text-fg m-2 flex h-8 items-center gap-2 rounded-md px-2"
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        {!collapsed && <span className="text-[12.5px]">Collapse</span>}
      </button>
    </motion.aside>
  );
}
