"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/**
 * router.push / replace inside a transition: `pending` stays true until the next page has rendered,
 * so the button that started it can show its loader (`<Button loading={nav.pending}>`) the same
 * way a saving button does.
 */
export function useNavigate() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  type Options = Parameters<typeof router.push>[1];
  return {
    pending,
    push: (href: string, options?: Options) => startTransition(() => router.push(href, options)),
    replace: (href: string, options?: Options) =>
      startTransition(() => router.replace(href, options)),
  };
}

/**
 * For navigations a transition can't follow (a link's own click, history back): `mark()` makes
 * `pending` true until the route changes, the page returns from the back/forward cache, or 10 s.
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
