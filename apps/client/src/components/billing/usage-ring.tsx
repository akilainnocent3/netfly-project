"use client";

import { cn } from "@netfly/ui";
import Link from "next/link";
import { forwardRef } from "react";
import { useUsage } from "@/lib/queries";
import { formatLeft } from "@/lib/usage-format";
import { SCOPE_PHRASE, tightestScope } from "@/lib/usage";

/** A small progress ring (fraction of the allowance left). */
export function MiniRing({ fraction, className }: { fraction: number; className?: string }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  const tone = f <= 0 ? "#eb3942" : f < 0.15 ? "#e87c03" : "#46d369";
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden
      className={cn("size-[18px] shrink-0 -rotate-90", className)}
    >
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="2.5" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - f)}
        className="transition-[stroke-dashoffset] duration-300 ease-out"
      />
    </svg>
  );
}

/** The line to show in the profile menu, or null (staff, unlimited, not loaded yet). */
export function useUsageLine(): { text: string; fraction: number } | null {
  const snap = useUsage().data;
  if (!snap || snap.exempt) return null;
  const scope = tightestScope(snap);
  if (!scope) return null;
  const left = snap.remaining[scope] ?? 0;
  const cap = snap.limits[scope] ?? 0;
  return {
    text:
      left > 0
        ? `${formatLeft(left)} left ${SCOPE_PHRASE[scope]}`
        : `No viewing time left ${SCOPE_PHRASE[scope]}`,
    fraction: cap ? left / cap : 0,
  };
}

/** Profile menu: one small line, "2h 14m left today", linking to Account → Usage. */
export const UsageMenuLine = forwardRef<
  HTMLAnchorElement,
  Omit<React.ComponentProps<typeof Link>, "href" | "children"> & {
    line: { text: string; fraction: number };
  }
>(function UsageMenuLine({ line, className, ...props }, ref) {
  return (
    <Link
      ref={ref}
      href="/account/usage"
      data-testid="usage-menu-line"
      className={cn(
        "text-meta flex items-center gap-2 text-white/85 outline-none hover:underline focus-visible:underline",
        className,
      )}
      {...props}
    >
      <MiniRing fraction={line.fraction} />
      {line.text}
    </Link>
  );
});
