"use client";

import { cn } from "./format";
import { LazyLogoLoader } from "./logo-loader-lazy";

/**
 * A navigation item's icon or label while the page it opens is loading: it fades to the `sm`
 * logo loader (after the loader's 200 ms delay, so a fast switch shows nothing) and comes back
 * when the page has loaded. The enclosing link or button ignores clicks meanwhile (`.nf-pending`
 * in logo-loader.css), so a second tap can't restart the navigation.
 *
 * The loader's size is `--nf-pending-size` (default 1.25em; set it to the icon's size).
 *
 * Each app feeds `pending` from Next's `useLinkStatus()` inside the `<Link>` (`LinkPending`), or
 * from a route-change mark where the link itself unmounts (a menu that closes on select).
 */
export function NavPending({
  pending,
  children,
  className,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("nf-pending", className)} data-pending={pending || undefined}>
      <span className={cn("nf-pending__content", pending && "nf-veil")}>{children}</span>
      {pending ? (
        <span aria-hidden className="nf-pending__loader">
          <LazyLogoLoader size="sm" decorative />
        </span>
      ) : null}
    </span>
  );
}
