"use client";

import { cn, LazyLogoLoader } from "@netfly/ui";
import { AnimatePresence, m } from "framer-motion";
import { Check, CircleX, X } from "lucide-react";
import { forwardRef, useId } from "react";

export type FieldIndicator = "none" | "checking" | "ok" | "bad";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  indicator?: FieldIndicator;
  /** Right-side control inside the box (e.g. SHOW for passwords). */
  trailing?: React.ReactNode;
}

/** Floating-label input (dark, high-contrast), with inline error / hint and a status indicator. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, indicator = "none", trailing, className, ...props },
  ref,
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("group relative", className)}>
      <div
        className={cn(
          "relative flex rounded-[4px] border bg-[rgb(22_22_22/0.7)] transition-colors duration-150",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white",
          error ? "border-[#eb3942]" : "border-[rgb(128_128_128/0.7)]",
        )}
      >
        <div className="relative min-w-0 flex-1">
          <input
            ref={ref}
            id={id}
            placeholder=" "
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className="peer text-body block h-14 w-full rounded-[4px] bg-transparent px-4 pt-5 pr-11 text-white outline-none placeholder:text-transparent focus-visible:outline-none"
            {...props}
          />
          <label
            htmlFor={id}
            className="text-body text-muted peer-focus:text-caption peer-[:not(:placeholder-shown)]:text-caption pointer-events-none absolute top-4 left-4 origin-left transition-all duration-150 peer-focus:top-2 peer-[:not(:placeholder-shown)]:top-2"
          >
            {label}
          </label>
          <span className="absolute top-1/2 right-4 -translate-y-1/2" aria-hidden>
            {indicator === "checking" && <LazyLogoLoader size="sm" decorative />}
            {indicator === "ok" && <Check className="size-4 text-[#46d369]" strokeWidth={3} />}
            {indicator === "bad" && <X className="size-4 text-[#eb3942]" strokeWidth={3} />}
          </span>
        </div>
        {trailing}
      </div>
      <AnimatePresence initial={false}>
        {error ? (
          <m.p
            key="error"
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-meta flex items-start gap-1.5 overflow-hidden px-1 pt-1.5 text-[#ff6b72]"
          >
            <CircleX className="mt-px size-4 shrink-0" aria-hidden />
            {error}
          </m.p>
        ) : hint ? (
          <m.div
            key="hint"
            id={`${id}-hint`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-meta text-muted px-1 pt-1.5"
          >
            {hint}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
