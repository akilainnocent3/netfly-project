"use client";

import { cn } from "@netfly/ui";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useUsage } from "@/lib/queries";
import { formatCountdown, formatLeft, useCountdown } from "@/lib/usage-format";
import type { UsageScope, UsageSnapshot } from "@/lib/usage";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";
import { AccountPanel } from "./account-nav";

const LABEL: Record<UsageScope, string> = { day: "Today", week: "This week", month: "This month" };

/**
 * Today / this week / this month as used vs limit, each with a live reset countdown (ticks every
 * second; re-synced from the server every 30 s and from every player heartbeat).
 */
export function UsageCard({ compact = false }: { compact?: boolean }) {
  const usage = useUsage();
  const snap = usage.data;
  return (
    <AccountPanel
      testId="usage-card"
      title={compact ? "Viewing time" : "Your viewing time"}
      description={
        snap?.exempt
          ? "Staff accounts have no viewing limits."
          : `Counted only while a title plays on your ${snap?.plan.name ?? ""} plan — browsing is always free.`
      }
    >
      {!snap ? (
        <div className="space-y-5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : snap.exempt ? (
        <p className="text-body text-[#b3b3b3]">Watch as much as you like.</p>
      ) : (
        <>
          <ul className="space-y-6">
            {(compact ? (["day"] as const) : (["day", "week", "month"] as const)).map((scope) => (
              <UsageBar
                key={scope}
                scope={scope}
                snap={snap}
                onReset={() => void usage.refetch()}
              />
            ))}
          </ul>
          <UpgradeHint snap={snap} />
        </>
      )}
    </AccountPanel>
  );
}

function UsageBar({
  scope,
  snap,
  onReset,
}: {
  scope: UsageScope;
  snap: UsageSnapshot;
  onReset: () => void;
}) {
  const limit = snap.limits[scope];
  const used = Math.min(snap.used[scope] ?? 0, limit ?? Infinity);
  const left = useCountdown(snap.resets_at[scope], snap.server_time);
  // The window rolled over: fetch the fresh (empty) counters right away.
  useEffect(() => {
    if (left === 0) onReset();
  }, [left, onReset]);
  const ratio = limit ? used / limit : 0;
  return (
    <li data-testid={`usage-${scope}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-body font-bold">{LABEL[scope]}</p>
        <p className="text-meta text-[#b3b3b3] tabular-nums">
          {limit == null ? (
            "Unlimited"
          ) : (
            <>
              <span className="font-semibold text-white">{formatLeft(used)}</span> of{" "}
              {formatLeft(limit)} used
            </>
          )}
        </p>
      </div>
      {limit != null ? (
        <div
          role="progressbar"
          aria-label={`${LABEL[scope]}: viewing time used`}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.round(used)}
          aria-valuetext={`${formatLeft(used)} of ${formatLeft(limit)} used`}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              ratio >= 1 ? "bg-[#eb3942]" : ratio >= 0.85 ? "bg-[#e87c03]" : "bg-accent",
            )}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      ) : null}
      <p className="text-meta mt-2 text-[#a3a3a3]">
        {limit != null ? <>{formatLeft(snap.remaining[scope])} left · </> : null}
        Resets in{" "}
        <span className="text-white/85 tabular-nums" data-testid={`resets-${scope}`}>
          {left === null ? "—" : formatCountdown(left)}
        </span>
      </p>
    </li>
  );
}

/** "Want more viewing time? Upgrade your plan" — only when a window is nearly or fully used. */
function UpgradeHint({ snap }: { snap: UsageSnapshot }) {
  const near = (["day", "week", "month"] as const).some((scope) => {
    const limit = snap.limits[scope];
    const left = snap.remaining[scope];
    return limit != null && left != null && left <= Math.max(600, limit * 0.15);
  });
  if (!near) return null;
  return (
    <div
      data-testid="upgrade-hint"
      className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-md bg-white/6 px-5 py-4"
    >
      <div>
        <p className="text-body font-bold">Want more viewing time?</p>
        <p className="text-meta text-[#b3b3b3]">
          Every plan streams in the same top quality — bigger plans just give you more hours.
        </p>
      </div>
      <Button asChild variant="accent" className="rounded">
        <Link href="/signup/plan?from=account">
          Upgrade your plan <ArrowUpRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
