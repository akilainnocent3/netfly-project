"use client";

import { cn } from "@netfly/ui";
import Link from "next/link";
import { useConfig } from "../providers/config";

export const BRAND = {
  logo: "/brand/netfly-logo.v2.svg",
  logoOnLight: "/brand/netfly-logo-on-light.v2.svg",
  mark: "/brand/netfly-mark.v2.svg",
} as const;

/**
 * The NETFLY logo from the brand kit (`branding.logo_url` overrides it).
 * `compact` shows just the mark on phones; `tone="light"` is for the white registration pages.
 */
export function Logo({
  className,
  href = "/browse",
  tone = "dark",
  compact = true,
}: {
  className?: string;
  href?: string;
  tone?: "dark" | "light";
  compact?: boolean;
}) {
  const config = useConfig();
  const name = config.str("branding.site_name", "NETFLY");
  const custom = config.str("branding.logo_url");
  const full = custom || (tone === "light" ? BRAND.logoOnLight : BRAND.logo);
  return (
    <Link
      href={href}
      aria-label={`${name} home`}
      className={cn(
        "inline-flex shrink-0 items-center pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={full}
        alt=""
        width={147}
        height={32}
        className={cn("h-7 w-auto md:h-8", compact && !custom && "hidden sm:block")}
      />
      {compact && !custom && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={BRAND.mark} alt="" width={32} height={32} className="size-8 sm:hidden" />
      )}
    </Link>
  );
}
