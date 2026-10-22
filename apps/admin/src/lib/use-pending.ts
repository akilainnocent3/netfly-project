"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * For navigations a button can't await (a link it sits in): `mark()` makes `pending` true until
 * the route changes, the page returns from the back/forward cache, or 10 s pass.
 */
export function useRouteChangePending() {
  const pathname = usePathname();
  const [markedOn, setMarkedOn] = useState<string | null>(null);
  useEffect(() => {
    if (markedOn === null) return;
    const reset = () => setMarkedOn(null);
    const timer = setTimeout(reset, 10_000);
    window.addEventListener("pageshow", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pageshow", reset);
    };
  }, [markedOn]);
  return {
    pending: markedOn !== null && markedOn === pathname,
    mark: () => setMarkedOn(pathname),
  };
}

/**
 * Busy state every Studio button shares: true while a promise returned by `onClick` is pending,
 * and after a plain click on a button inside a link until the next page has loaded. Wraps the
 * handler; the caller's `loading` prop still applies on top.
 */
export function useBusyClick(
  onClick: React.MouseEventHandler<HTMLButtonElement> | undefined,
): [boolean, React.MouseEventHandler<HTMLButtonElement>] {
  const [running, setRunning] = useState(false);
  const route = useRouteChangePending();
  const handle: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    const result: unknown = onClick?.(e);
    if (result instanceof Promise) {
      setRunning(true);
      void result.finally(() => setRunning(false));
    }
    const inLink = e.currentTarget.closest("a[href]");
    const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
    // Only a new path is waited for: a query/hash change on this page never changes the pathname.
    const samePath =
      inLink && new URL(inLink.getAttribute("href")!, location.href).pathname === location.pathname;
    if (
      inLink &&
      plain &&
      !samePath &&
      !e.defaultPrevented &&
      inLink.getAttribute("target") !== "_blank"
    )
      route.mark();
  };
  return [running || route.pending, handle];
}
