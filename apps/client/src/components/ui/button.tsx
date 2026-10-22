"use client";

import { cn, LazyLogoLoader } from "@netfly/ui";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cloneElement, forwardRef, isValidElement, useState } from "react";
import { useRouteChangePending } from "@/lib/use-navigate";

export type ButtonVariant =
  | "play"
  | "secondary"
  | "accent"
  | "ghost"
  | "icon-circle"
  /** Primary action on the white registration pages (blue focus ring on white). */
  | "accent-light"
  /** Text action on the white registration pages ("Resend code"). */
  | "ghost-light";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-bold transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out " +
  "active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 " +
  "pointer-coarse:min-h-11 pointer-coarse:min-w-11 aria-disabled:pointer-events-none";

const VARIANT: Record<ButtonVariant, string> = {
  // White is only for starting playback (Play, Resume, Continue watching); every other primary
  // action is `accent` (red).
  play: "rounded-md bg-white text-black hover:bg-white/75",
  secondary:
    "rounded-md bg-secondary-btn text-white backdrop-blur-sm hover:bg-[rgb(109_109_110/0.45)]",
  // Netflix red #E50914 → hover #C11119 → pressed #B20710, derived from the brand accent.
  accent:
    "rounded-md bg-accent text-accent-fg hover:bg-[color-mix(in_srgb,var(--accent)_84%,black)] active:bg-[color-mix(in_srgb,var(--accent)_78%,black)]",
  "accent-light":
    "rounded-[4px] bg-accent text-accent-fg hover:bg-[color-mix(in_srgb,var(--accent)_84%,black)] active:bg-[color-mix(in_srgb,var(--accent)_78%,black)] focus-visible:outline-[#0071eb]",
  ghost: "rounded-md text-white/80 hover:bg-white/10 hover:text-white",
  "ghost-light":
    "rounded-[4px] font-semibold text-[#333] underline-offset-2 hover:underline focus-visible:outline-[#0071eb] disabled:no-underline",
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
  /**
   * Disables the button and shows the brand loader over the label (width stays stable). Also
   * automatic while a promise returned by `onClick` is pending, and for a link button (asChild)
   * until the next page has loaded.
   */
  loading?: boolean;
  /** Leading icon (hidden under the loader while loading). */
  icon?: React.ReactNode;
  /** Render the child (e.g. a Next <Link>) with button styling. */
  asChild?: boolean;
  fullWidth?: boolean;
}

/**
 * A link-button (asChild) after a plain click: busy until the route changes, so it behaves like a
 * saving button (disabled, logo loader) while the next page loads. Clicks that open a new tab or
 * that the link cancels (e.g. Play opening the sign-in gate) don't count.
 */
function useLinkPending(enabled: boolean) {
  const route = useRouteChangePending();
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!enabled || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.currentTarget.getAttribute("target");
    if (target && target !== "_self") return;
    // Only a new path is waited for: a query/hash change on this page never changes the pathname.
    const href = e.currentTarget.getAttribute("href");
    if (href && new URL(href, location.href).pathname === location.pathname) return;
    route.mark();
  };
  return { pending: route.pending, onClick };
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
  const link = useLinkPending(!!asChild);
  const [running, setRunning] = useState(false);
  const busy = loading || link.pending || running;
  const isDisabled = disabled || busy;
  // Loading: the label stays in place (so the width and accessible name don't change) and fades
  // out only when the loader appears, after the loader's delay: a fast save never flickers.
  const veiled = busy;
  const label = (content: React.ReactNode) => (
    <span className={cn("inline-flex items-center gap-2", veiled && "nf-veil")}>{content}</span>
  );
  // asChild: the link's own label is wrapped, so it fades exactly like a button's.
  const slotted =
    asChild && isValidElement<{ children?: React.ReactNode }>(children)
      ? cloneElement(children, undefined, label(children.props.children))
      : children;
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      disabled={asChild ? undefined : isDisabled}
      aria-disabled={asChild && isDisabled ? true : undefined}
      aria-busy={busy || undefined}
      className={cn(
        BASE,
        "relative",
        VARIANT[variant],
        SIZE[circle ? "circle" : "rect"][size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        // An async handler keeps the button busy until it settles.
        const result: unknown = props.onClick?.(e);
        if (result instanceof Promise) {
          setRunning(true);
          void result.finally(() => setRunning(false));
        }
        if (asChild) link.onClick(e);
      }}
    >
      {/* Flat children (no fragment): Slot needs to see Slottable directly for asChild. */}
      {circle && busy && !asChild ? (
        <LazyLogoLoader size="sm" decorative delay={0} className="text-current" />
      ) : null}
      {!circle && icon ? (
        <span className={cn("inline-flex shrink-0 [&_svg]:size-[1.15em]", veiled && "nf-veil")}>
          {icon}
        </span>
      ) : null}
      {circle && busy && !asChild ? null : asChild ? (
        <Slottable>{slotted}</Slottable>
      ) : children != null && children !== false ? (
        label(children)
      ) : null}
      {veiled && (!circle || asChild) ? (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <LazyLogoLoader size="sm" decorative className="text-current [--nf-size:1.25em]" />
        </span>
      ) : null}
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
  // Ghost / play icon buttons: round, icon-sized (the loader covers the icon while loading).
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
