"use client";

import { cn } from "@netfly/ui";

/** Page indicator (dashes). Interactive when `onSelect` is given (hero rotation), passive for rows. */
export function PageDots({
  count,
  active,
  onSelect,
  labels,
  className,
  label = "Pages",
}: {
  count: number;
  active: number;
  onSelect?: (i: number) => void;
  labels?: string[];
  className?: string;
  label?: string;
}) {
  if (count < 2) return null;
  if (!onSelect) {
    return (
      <div className={cn("flex gap-[3px]", className)} aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-[2px] w-3 transition-colors duration-200",
              i === active ? "bg-white/90" : "bg-white/30",
            )}
          />
        ))}
      </div>
    );
  }
  return (
    <div className={cn("flex gap-1.5", className)} role="tablist" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === active}
          aria-label={labels?.[i] ?? `Page ${i + 1}`}
          onClick={() => onSelect(i)}
          className={cn(
            "h-1 rounded-full transition-all duration-500 pointer-coarse:h-2",
            i === active ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/70",
          )}
        />
      ))}
    </div>
  );
}
