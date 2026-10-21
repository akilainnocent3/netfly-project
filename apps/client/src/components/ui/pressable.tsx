"use client";

import { cn } from "@netfly/ui";
import { forwardRef } from "react";

/**
 * Unstyled pressable surface for selection controls that are not "buttons" visually (tabs,
 * avatar tiles, menu triggers). It carries the same focus ring, press feedback, disabled state
 * and 44px touch target as Button; anything that triggers a request should use Button instead.
 */
export const Pressable = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function Pressable({ className, type, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(
        "transition-[transform,background-color,color,box-shadow] duration-150 ease-out outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 pointer-coarse:min-h-11",
        className,
      )}
      {...props}
    />
  );
});
