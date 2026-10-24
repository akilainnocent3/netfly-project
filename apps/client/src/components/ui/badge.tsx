import { cn } from "@netfly/ui";

export type BadgeKind =
  "top10" | "new" | "recently_added" | "new_episodes" | "leaving_soon" | "neutral";

const LABEL: Record<Exclude<BadgeKind, "neutral" | "top10">, string> = {
  new: "New",
  recently_added: "Recently added",
  new_episodes: "New episodes",
  leaving_soon: "Leaving soon",
};

/**
 * Card / hero ribbons. `top10` renders the TOP 10 mark with the rank. The others are a small,
 * discreet ribbon (≈10 px caps, 2 × 4 px padding, radius 2), the one exception to the 12 px text
 * minimum (DECISIONS 52a). Colours keep WCAG AA contrast (white on accent 4.8:1).
 */
export function Badge({
  kind,
  rank,
  children,
  className,
}: {
  kind: BadgeKind;
  rank?: number | null;
  children?: React.ReactNode;
  className?: string;
}) {
  if (kind === "top10") {
    return (
      <span
        className={cn(
          "bg-accent inline-flex flex-col items-center justify-center rounded-sm px-1 py-0.5 leading-none text-white shadow",
          className,
        )}
        aria-label={`Top 10${rank ? `, number ${rank}` : ""}`}
      >
        <span className="text-[0.5rem] font-black tracking-wider">TOP</span>
        <span className="text-[0.95rem] font-black">10</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] px-1 py-0.5 text-[9.5px] leading-[1.1] font-bold tracking-[0.04em] uppercase sm:text-[10px]",
        kind === "leaving_soon"
          ? "bg-white/90 text-black"
          : kind === "neutral"
            ? "bg-black/70 text-white/85"
            : "bg-accent text-white",
        className,
      )}
    >
      {children ?? (kind === "neutral" ? null : LABEL[kind])}
    </span>
  );
}

export function badgeFromApi(badge: string | null | undefined): BadgeKind | null {
  if (!badge) return null;
  if (
    badge === "top10" ||
    badge === "recently_added" ||
    badge === "new_episodes" ||
    badge === "leaving_soon" ||
    badge === "new"
  )
    return badge;
  return null;
}
