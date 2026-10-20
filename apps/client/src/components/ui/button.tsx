"use client";

import { cn } from "@netfly/ui";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { forwardRef } from "react";
import { Spinner } from "./spinner";

export type ButtonVariant = "play" | "secondary" | "accent" | "ghost" | "icon-circle";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-bold transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out " +
  "active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 " +
  "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

const VARIANT: Record<ButtonVariant, string> = {
  play: "rounded-md bg-white text-black hover:bg-white/75",
  secondary:
    "rounded-md bg-secondary-btn text-white backdrop-blur-sm hover:bg-[rgb(109_109_110/0.45)]",
  accent: "rounded-md bg-accent text-accent-fg hover:brightness-110",
  ghost: "rounded-md text-white/80 hover:bg-white/10 hover:text-white",
  "icon-circle": "rounded-full border-2 border-white/50 bg-black/45 text-white hover:border-white",
};

const SIZE: Record<"rect" | "circle", Record<ButtonSize, string>> = {
  rect: { sm: "h-8 px-3 text-meta", md: "h-10 px-5 text-body", lg: "h-12 px-7 text-lead" },
  circle: {
    sm: "size-8 [&_svg]:size-4",
    md: "size-9 [&_svg]:size-[18px]",
    lg: "size-11 [&_svg]:size-5",
  },
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and swaps the icon for a spinner (width stays stable). */
  loading?: boolean;
  /** Leading icon (replaced by the spinner while loading). */
  icon?: React.ReactNode;
  /** Render the child (e.g. a Next <Link>) with button styling. */
  asChild?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    asChild,
    fullWidth,
    className,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const circle = variant === "icon-circle";
  const Comp = asChild ? Slot : "button";
  const isDisabled = disabled || loading;
  const lead = loading ? <Spinner className={circle ? "" : "size-[1.1em]"} /> : icon;
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      disabled={asChild ? undefined : isDisabled}
      aria-disabled={asChild && isDisabled ? true : undefined}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        VARIANT[variant],
        SIZE[circle ? "circle" : "rect"][size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {/* Flat children (no fragment): Slot needs to see Slottable directly for asChild. */}
      {circle && loading ? <Spinner /> : null}
      {!circle && lead ? (
        <span className="inline-flex shrink-0 [&_svg]:size-[1.15em]">{lead}</span>
      ) : null}
      {circle && loading ? null : <Slottable>{children}</Slottable>}
    </Comp>
  );
});

/** Icon-only button (round, Netflix-style): the accessible label is required. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "variant" | "icon" | "aria-label"> & {
    label: string;
    variant?: "icon-circle" | "ghost" | "play";
  }
>(function IconButton(
  { label, variant = "icon-circle", size = "md", className, children, ...props },
  ref,
) {
  if (variant === "icon-circle") {
    return (
      <Button
        ref={ref}
        variant="icon-circle"
        size={size}
        aria-label={label}
        title={label}
        className={className}
        {...props}
      >
        {children}
      </Button>
    );
  }
  const round = cn("aspect-square rounded-full !px-0 !gap-0", SIZE.circle[size], className);
  if (props.asChild) {
    // The child (e.g. a Link) carries the icon itself.
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        aria-label={label}
        title={label}
        className={round}
        {...props}
      >
        {children}
      </Button>
    );
  }
  // Ghost / play icon buttons: round, icon-sized (spinner replaces the icon while loading).
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      icon={children}
      className={round}
      {...props}
    />
  );
});
