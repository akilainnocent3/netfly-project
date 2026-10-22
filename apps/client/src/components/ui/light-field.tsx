"use client";

import { cn, LazyLogoLoader } from "@netfly/ui";
import { CircleAlert, CircleCheck } from "lucide-react";
import { forwardRef, useId } from "react";
import { useEarlyInput } from "./early-input";
import type { FieldIndicator } from "./field";

interface LightFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  indicator?: FieldIndicator;
  /** Right-side control inside the box (e.g. SHOW for passwords). */
  trailing?: React.ReactNode;
  /** Left-side content inside the box (e.g. a country code). */
  leading?: React.ReactNode;
}

/**
 * Floating-label input for the white registration pages (signup steps, plan, verification,
 * payment): white box, 1px #8C8C8C border, 4px radius, 56px tall, blue focus ring.
 */
export const LightField = forwardRef<HTMLInputElement, LightFieldProps>(function LightField(
  { label, error, hint, indicator = "none", trailing, leading, className, ...props },
  ref,
) {
  const id = useId();
  const inputRef = useEarlyInput(ref, props.value, props.onChange);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const bad = !!error || indicator === "bad";
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "relative flex items-stretch rounded-[4px] border bg-white transition-shadow duration-150",
          "focus-within:shadow-[0_0_0_2px_#fff,0_0_0_4px_#0071eb]",
          bad ? "border-[#e50914]" : indicator === "ok" ? "border-[#2f9e44]" : "border-[#8c8c8c]",
        )}
      >
        {leading}
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id={id}
            placeholder=" "
            aria-invalid={bad || undefined}
            aria-describedby={describedBy}
            className="peer text-lead block h-14 w-full rounded-[4px] bg-transparent px-4 pt-5 pr-11 text-[#333] outline-none placeholder:text-transparent focus-visible:outline-none"
            {...props}
          />
          <label
            htmlFor={id}
            className="text-lead peer-focus:text-meta peer-[:not(:placeholder-shown)]:text-meta pointer-events-none absolute top-4 left-4 origin-left text-[#737373] transition-all duration-150 peer-focus:top-2 peer-[:not(:placeholder-shown)]:top-2"
          >
            {label}
          </label>
          <span className="absolute top-1/2 right-3.5 -translate-y-1/2" aria-hidden>
            {indicator === "checking" && <LazyLogoLoader size="sm" decorative />}
            {indicator === "ok" && <CircleCheck className="size-5 text-[#2f9e44]" />}
            {bad && indicator !== "checking" && <CircleAlert className="size-5 text-[#e50914]" />}
          </span>
        </div>
        {trailing}
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-meta mt-1.5 flex items-start gap-1.5 px-0.5 text-[#b20710]"
        >
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-meta mt-1.5 px-0.5 text-[#595959]">
          {hint}
        </div>
      ) : null}
    </div>
  );
});
