"use client";

import { cn } from "@netfly/ui";
import Link from "next/link";
import { useConfig } from "../providers/config";

/** Logo from `branding.logo_url`, or a wordmark built from `branding.site_name`. */
export function Logo({ className, href = "/browse" }: { className?: string; href?: string }) {
  const config = useConfig();
  const name = config.str("branding.site_name", "NETFLY");
  const logo = config.str("branding.logo_url");
  return (
    <Link href={href} aria-label={`${name} home`} className={cn("inline-flex items-center", className)}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={name} className="h-7 w-auto md:h-8" />
      ) : (
        <span className="flex items-center gap-1.5 text-[22px] font-black uppercase tracking-[-0.04em] md:text-[26px]">
          <span className="relative inline-block size-[0.8em] rotate-45 rounded-[0.18em] bg-accent shadow-[0_0_24px_rgb(var(--accent-rgb)/0.6)]">
            <span className="absolute inset-[0.2em] rounded-[0.08em] bg-bg/90" />
          </span>
          <span>{name}</span>
        </span>
      )}
    </Link>
  );
}
