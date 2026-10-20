"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { CommandPalette } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Skeleton } from "@/components/ui/primitives";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("netfly-admin-sidebar") === "collapsed");
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("netfly-admin-sidebar", c ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-[232px] border-r border-line bg-panel md:block" />
        <div className="flex-1 p-6">
          <Skeleton className="mb-6 h-6 w-48" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="min-w-0 flex-1">
        <Topbar onOpenPalette={() => setPalette(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">{children}</main>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
