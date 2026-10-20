"use client";

import type { AutoSubmitStatus } from "@netfly/ui";
import { cn } from "@netfly/ui";

/** Low-emphasis fallback button + inline status. Auto-submit is the main path. */
export function SubmitRow({
  status,
  label,
  ready,
}: {
  status: AutoSubmitStatus;
  label: string;
  ready: boolean;
}) {
  const text =
    status === "submitting"
      ? "Just a moment…"
      : status === "waiting"
        ? "Looks good — continuing…"
        : "";
  return (
    <div className="mt-6 flex items-center justify-between gap-4">
      <span className="text-muted text-[13px]" aria-live="polite">
        {text}
      </span>
      <button
        type="submit"
        disabled={status === "submitting"}
        className={cn(
          "rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200",
          ready
            ? "text-fg bg-white/12 hover:bg-white/20"
            : "text-subtle hover:text-muted bg-white/[0.04] hover:bg-white/[0.08]",
        )}
      >
        {label}
      </button>
    </div>
  );
}
