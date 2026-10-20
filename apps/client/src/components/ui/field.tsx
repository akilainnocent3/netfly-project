"use client";

import { cn } from "@netfly/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import { forwardRef, useId } from "react";

export type FieldIndicator = "none" | "checking" | "ok" | "bad";

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  indicator?: FieldIndicator;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, indicator = "none", className, ...props },
  ref,
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("group relative", className)}>
      <div
        className={cn(
          "relative rounded-xl border bg-white/[0.04] transition-colors duration-200",
          "focus-within:border-fg/40 focus-within:bg-white/[0.07] focus-within:ring-2 focus-within:ring-accent/50",
          error ? "border-red-400/70" : "border-white/10",
        )}
      >
        <input
          ref={ref}
          id={id}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="peer block h-14 w-full rounded-xl bg-transparent focus-visible:outline-none px-4 pt-5 pr-11 text-[15px] text-fg outline-none placeholder:text-transparent"
          {...props}
        />
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-4 top-4 origin-left text-[15px] text-muted transition-all duration-200 peer-focus:top-2 peer-focus:text-[11px] peer-focus:tracking-wide peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:tracking-wide"
        >
          {label}
        </label>
        <span className="absolute right-4 top-1/2 -translate-y-1/2" aria-hidden>
          {indicator === "checking" && <Loader2 className="size-4 animate-spin text-muted" />}
          {indicator === "ok" && <Check className="size-4 text-emerald-400" strokeWidth={3} />}
          {indicator === "bad" && <X className="size-4 text-red-400" strokeWidth={3} />}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="error"
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-1 pt-1.5 text-[13px] text-red-300"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <motion.div key="hint" id={`${id}-hint`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1 pt-1.5 text-[13px] text-muted">
            {hint}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
