"use client";

import { cn, LazyLogoLoader } from "@netfly/ui";
import { Check } from "lucide-react";

/** Labelled on/off switch row. While `saving`, it is disabled and shows the brand loader in the thumb. */
export function SwitchRow({
  label,
  description,
  checked,
  saving,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  saving?: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={saving || undefined}
      disabled={disabled || saving}
      onClick={() => onChange(!checked)}
      className="flex items-start justify-between gap-4 rounded-md bg-white/[0.03] p-4 text-left ring-1 ring-white/8 transition duration-150 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span>
        <span className="text-body block font-semibold">{label}</span>
        {description && <span className="text-meta text-muted mt-0.5 block">{description}</span>}
      </span>
      <span
        className={cn(
          "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "text-accent absolute top-0.5 grid size-5 place-items-center rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        >
          {saving ? (
            <LazyLogoLoader size="sm" decorative delay={0} className="[--nf-size:12px]" />
          ) : (
            checked && <Check className="size-3" strokeWidth={3} />
          )}
        </span>
      </span>
    </button>
  );
}
