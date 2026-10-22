"use client";

import { lazy, Suspense } from "react";
import { cn } from "./format";
import type { LogoLoaderProps } from "./logo-mark";

const Loader = lazy(() => import("./logo-mark").then((m) => ({ default: m.LogoLoader })));

/**
 * <LogoLoader> loaded on first use, for loaders that only appear after an interaction (saving
 * buttons, field checks, switches), so pages don't ship the mark's geometry for them up front.
 * It normally arrives well within the loader's 200 ms delay; until then an empty box of the same
 * size holds the place.
 */
export function LazyLogoLoader(props: LogoLoaderProps) {
  return (
    <Suspense
      fallback={
        <span
          aria-hidden
          className={cn("nf-loader", props.className)}
          data-size={props.size ?? "md"}
        >
          <span className="nf-loader__art" />
        </span>
      }
    >
      <Loader {...props} />
    </Suspense>
  );
}
