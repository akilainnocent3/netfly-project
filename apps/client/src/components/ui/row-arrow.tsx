"use client";

import { cn } from "@netfly/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Full-height paging control at a row's edge (desktop). */
export function RowArrow({
  side,
  hidden,
  onClick,
}: {
  side: "left" | "right";
  hidden: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      onClick={onClick}
      className={cn(
        "absolute top-1 bottom-6 z-20 hidden w-[max(4vw,16px)] items-center justify-center bg-black/55 text-white opacity-0 transition-opacity duration-200 hover:bg-black/75 md:flex",
        side === "left" ? "left-0 rounded-r-md" : "right-0 rounded-l-md",
        !hidden && "group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        hidden && "pointer-events-none",
      )}
    >
      {side === "left" ? (
        <ChevronLeft className="size-8 transition-transform hover:scale-125" />
      ) : (
        <ChevronRight className="size-8 transition-transform hover:scale-125" />
      )}
    </button>
  );
}
