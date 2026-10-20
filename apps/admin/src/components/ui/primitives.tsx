"use client";

import { cn } from "@netfly/ui";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110 shadow-sm",
  secondary: "border border-line bg-panel hover:bg-hover",
  ghost: "hover:bg-hover text-muted hover:text-fg",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md"; loading?: boolean }
>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid}
        className={cn(
          "h-8 w-full rounded-md border bg-panel px-2.5 text-[13px] outline-none transition-shadow placeholder:text-subtle",
          "focus:border-accent focus:ring-2 focus:ring-accent/20 focus-visible:outline-none",
          invalid ? "border-red-500" : "border-line",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-md border border-line bg-panel px-2.5 py-2 text-[13px] outline-none placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 focus-visible:outline-none",
          className,
        )}
        {...props}
      />
    );
  },
);

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 rounded-md border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, hint, htmlFor }: { children: React.ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-[12.5px] font-medium">
      <span>{children}</span>
      {hint && <span className="font-normal text-subtle">{hint}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="relative h-[18px] w-8 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-accent disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

const BADGE_TONES = {
  neutral: "bg-raised text-muted border-line",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  red: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  blue: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  accent: "bg-accent/10 text-accent border-accent/20",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[11.5px] font-medium", BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-lg border border-line bg-panel", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-1 text-subtle">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-[13px] text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded", className)} />;
}
