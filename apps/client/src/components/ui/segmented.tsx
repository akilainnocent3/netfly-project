"use client";

import { cn } from "@netfly/ui";
import { m } from "framer-motion";
import { useId } from "react";

export interface SegmentOption<V extends string> {
  value: V;
  label: React.ReactNode;
}

/** Radio-group segmented control with a sliding indicator; ←/→ move the selection. */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  tone = "accent",
  className,
}: {
  options: Array<SegmentOption<V>>;
  value: V | null;
  onChange: (v: V) => void;
  label: string;
  size?: "sm" | "md";
  tone?: "accent" | "light";
  className?: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        // Touch: the buttons take the full height (44 px targets); the pill keeps its look.
        "relative flex items-center rounded-full border border-white/12 bg-black/45 p-1 backdrop-blur-xl pointer-coarse:py-0",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next =
          options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
        if (next) onChange(next.value);
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 rounded-full font-semibold whitespace-nowrap transition-colors duration-150 pointer-coarse:min-h-11",
              // The narrowest phones (320 px) need the header row to fit: tighter pills there.
              size === "sm"
                ? "text-meta max-[359px]:text-caption px-3 py-1.5 max-[359px]:px-1.5"
                : "text-body px-4 py-1.5",
              active
                ? tone === "accent"
                  ? "text-accent-fg"
                  : "text-black"
                : "text-white/70 hover:text-white",
            )}
          >
            {active && (
              <m.span
                layoutId={`segment-${id}`}
                className={cn(
                  "absolute inset-0 -z-10 rounded-full pointer-coarse:inset-y-1",
                  tone === "accent" ? "bg-accent" : "bg-white",
                )}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
