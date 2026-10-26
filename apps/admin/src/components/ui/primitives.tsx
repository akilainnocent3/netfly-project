"use client";

import { cn, LazyLogoLoader } from "@netfly/ui";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { forwardRef } from "react";
import { useBusyClick } from "@/lib/use-pending";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 shadow-sm",
  secondary: "border border-line bg-panel hover:bg-hover",
  ghost: "hover:bg-hover text-muted hover:text-fg",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "sm" | "md";
    loading?: boolean;
  }
>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, onClick, ...props },
  ref,
) {
  // Also busy while an async onClick runs, or after a click on a button inside a link.
  const [clickBusy, handleClick] = useBusyClick(onClick);
  const busy = loading || clickBusy;
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
        VARIANTS[variant],
        className,
      )}
      {...props}
      onClick={handleClick}
    >
      {busy && <LazyLogoLoader size="sm" decorative className="text-current [--nf-size:14px]" />}
      {children}
    </button>
  );
});

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid}
      className={cn(
        "bg-panel placeholder:text-subtle h-8 w-full rounded-md border px-2.5 text-[13px] transition-shadow outline-none",
        "focus:border-accent focus:ring-accent/20 focus:ring-2 focus-visible:outline-none",
        invalid ? "border-red-500" : "border-line",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "border-line bg-panel placeholder:text-subtle focus:border-accent focus:ring-accent/20 w-full rounded-md border px-2.5 py-2 text-[13px] outline-none focus:ring-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
});

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "border-line bg-panel focus:border-accent focus:ring-accent/20 h-8 rounded-md border px-2 text-[13px] outline-none focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  children,
  hint,
  htmlFor,
}: {
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-baseline justify-between text-[12.5px] font-medium"
    >
      <span>{children}</span>
      {hint && <span className="text-subtle font-normal">{hint}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  "aria-describedby": describedBy,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      aria-describedby={describedBy}
      className="bg-line data-[state=checked]:bg-accent relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

// Text tones are WCAG AA (≥ 4.5:1) on their tint over panel and raised surfaces in both themes.
// The accent is configurable, so its badge text is darkened in light mode.
const BADGE_TONES = {
  neutral: "bg-raised text-muted border-line",
  green: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/20",
  red: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  blue: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  accent:
    "bg-accent/10 text-[color-mix(in_oklab,var(--accent)_78%,black)] dark:text-accent border-accent/20",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[12px] font-medium",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("border-line bg-panel rounded-lg border", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted mt-0.5 text-[13px]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="text-subtle mb-1">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted max-w-sm text-[13px]">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded", className)} />;
}
