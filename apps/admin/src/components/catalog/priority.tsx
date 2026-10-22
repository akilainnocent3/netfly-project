"use client";

import { cn, LazyLogoLoader } from "@netfly/ui";

import { Badge } from "../ui/primitives";

export const PRIORITY_LEVELS = [
  { value: -2, label: "Demote", short: "−2" },
  { value: -1, label: "−1", short: "−1" },
  { value: 0, label: "Normal", short: "0" },
  { value: 1, label: "+1", short: "+1" },
  { value: 2, label: "+2", short: "+2" },
  { value: 3, label: "+3", short: "+3" },
  { value: 5, label: "Pinned", short: "+5" },
] as const;

export function priorityTone(boost: number): "neutral" | "green" | "accent" | "amber" | "red" {
  if (boost >= 5) return "accent";
  if (boost > 0) return "green";
  if (boost === -1) return "amber";
  if (boost < 0) return "red";
  return "neutral";
}

export function priorityLabel(boost: number): string {
  if (boost >= 5) return "Pinned +5";
  if (boost > 0) return `Boost +${boost}`;
  if (boost <= -2) return "Demoted −2";
  if (boost < 0) return `Lowered ${boost}`;
  return "Normal";
}

/** Badge for tables. `effective` differs from `boost` outside the campaign window. */
export function PriorityBadge({ boost, effective }: { boost: number; effective?: number }) {
  if (!boost) return <span className="text-subtle">—</span>;
  const inactive = effective !== undefined && effective !== boost;
  return (
    <Badge
      tone={inactive ? "neutral" : priorityTone(boost)}
      className={cn(inactive && "line-through decoration-1")}
    >
      {priorityLabel(boost)}
      {inactive && <span className="no-underline">· scheduled</span>}
    </Badge>
  );
}

export function PrioritySegmented({
  value,
  onChange,
  disabled,
  pending,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  pending?: number | null;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Recommendation priority"
      className="border-line bg-raised inline-flex flex-wrap rounded-md border p-0.5"
    >
      {PRIORITY_LEVELS.map((level) => {
        const active = level.value === value;
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || pending != null}
            onClick={() => !active && onChange(level.value)}
            className={cn(
              "tabular inline-flex items-center gap-1 rounded font-medium transition-colors disabled:cursor-not-allowed",
              size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]",
              active
                ? level.value > 0
                  ? "bg-emerald-500/15 text-emerald-700 shadow-sm dark:text-emerald-300"
                  : level.value < 0
                    ? "bg-red-500/15 text-red-700 shadow-sm dark:text-red-300"
                    : "bg-panel shadow-sm"
                : "text-muted hover:text-fg",
              pending != null && pending !== level.value && "opacity-50",
            )}
          >
            {pending === level.value && (
              <LazyLogoLoader size="sm" decorative className="text-current [--nf-size:12px]" />
            )}
            {size === "sm" ? level.short : level.label}
          </button>
        );
      })}
    </div>
  );
}

export function explainPriority(
  boost: number,
  startsAt?: string | null,
  endsAt?: string | null,
): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const now = Date.now();
  const window =
    startsAt && new Date(startsAt).getTime() > now
      ? ` from ${fmt(startsAt)}${endsAt ? ` until ${fmt(endsAt)}` : ""}`
      : endsAt
        ? ` until ${fmt(endsAt)}`
        : "";
  if (endsAt && new Date(endsAt).getTime() <= now && boost)
    return "The campaign has ended — treated as normal priority.";
  if (boost >= 5)
    return `Pinned to the first slots of Top picks and the billboard for all viewers${window}.`;
  if (boost > 0)
    return `Shown higher in Top picks, genre rows and the billboard for all viewers${window}.`;
  if (boost < 0)
    return `Shown lower in personalised rows and the billboard${window}. Top 10 and Trending are unaffected.`;
  return "Ranked purely on each viewer's taste and popularity.";
}
