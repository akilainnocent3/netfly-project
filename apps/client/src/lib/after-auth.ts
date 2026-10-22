"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { safeNext } from "./safe-next";

/**
 * Leave the auth / plan / payment flow for `next` without a page reload. The refresh drops
 * server components rendered before the session cookie existed. Title pages are the one
 * exception: a soft navigation from outside the browse layout would be caught by the
 * intercepting title modal with no page behind it, so they still get a full load.
 */
export function useGoAfterAuth(): (next: string | null | undefined) => void {
  const router = useRouter();
  return useCallback(
    (next) => {
      const target = safeNext(next);
      if (target.startsWith("/title/")) {
        window.location.replace(target);
        return;
      }
      router.replace(target);
      router.refresh();
    },
    [router],
  );
}
