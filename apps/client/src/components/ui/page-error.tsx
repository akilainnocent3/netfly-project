"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Button } from "./button";
import { StateMessage } from "./state-message";

/** Route-level failure (rendered by error.tsx): retry re-renders the segment with fresh data. */
export function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="pt-[calc(var(--header-h,64px)+env(safe-area-inset-top))]">
      <StateMessage tone="error" title={offline ? "You're offline" : "This page didn't load"}>
        {offline
          ? "Reconnect and try again."
          : "Something went wrong on our side. It usually clears up in a moment."}
      </StateMessage>
      <div className="-mt-12 flex justify-center pb-16">
        <Button
          variant="accent"
          loading={pending}
          onClick={() =>
            start(() => {
              router.refresh();
              reset();
            })
          }
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
