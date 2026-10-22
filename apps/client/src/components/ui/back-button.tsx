"use client";

import { cn, LazyLogoLoader } from "@netfly/ui";
import { ChevronLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useRouteChangePending } from "@/lib/use-navigate";

// How many in-app steps "back" would undo: +1 per client navigation, −1 per history pop.
let depth = 0;
let popped = false;
if (typeof window !== "undefined") window.addEventListener("popstate", () => (popped = true));

/** Count client navigations (mounted once, in the root providers). */
export function useNavigationDepth() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    depth = popped ? Math.max(0, depth - 1) : depth + 1;
    popped = false;
  }, [pathname]);
}

export function canGoBack(): boolean {
  if (depth > 0) return true;
  // A full page load from another page of this site (public pages use plain links).
  try {
    return !!document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
}

/** Where "back" goes when there is no in-app history: the page's parent. */
export function parentRoute(pathname: string): string {
  if (pathname.startsWith("/categories/")) return "/categories";
  if (pathname.startsWith("/account/")) return "/account";
  if (pathname.startsWith("/legal/")) return "/";
  return "/browse";
}

/** Phones: the back chevron of nested pages (≥ 44 px). History back, else the parent route. */
export function BackButton({ className, fallback }: { className?: string; fallback?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const leaving = useRouteChangePending();
  return (
    <button
      type="button"
      aria-label="Back"
      aria-busy={leaving.pending || undefined}
      disabled={leaving.pending}
      onClick={() => {
        leaving.mark();
        if (canGoBack()) router.back();
        else router.push(fallback ?? parentRoute(pathname));
      }}
      className={cn(
        "-ml-2.5 grid size-11 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/10",
        className,
      )}
    >
      {leaving.pending ? (
        <LazyLogoLoader size="sm" decorative delay={0} />
      ) : (
        <ChevronLeft className="size-7" strokeWidth={2.2} />
      )}
    </button>
  );
}
