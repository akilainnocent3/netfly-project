"use client";

import { NavPending } from "@netfly/ui";
import { useLinkStatus } from "next/link";

/**
 * Inside a navigation `<Link>`: its icon or label turns into the logo loader while that link's
 * page is loading, and the link ignores further taps until it has (see `NavPending`).
 */
export function LinkPending({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <NavPending pending={pending} className={className}>
      {children}
    </NavPending>
  );
}
