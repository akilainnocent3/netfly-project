import type { Schemas } from "@netfly/api-client";

export type UsageSnapshot = Schemas["UsageSnapshot"];
export type UsageScope = "day" | "week" | "month";

/**
 * Fresh usage snapshots from outside React Query (player heartbeats, a 403 on Play) are
 * published here; <UsageSync> writes them into the ["usage"] query so the profile menu,
 * Account and the Play guard all see the same numbers at once.
 */
type Listener = (snapshot: UsageSnapshot) => void;
const listeners = new Set<Listener>();

export function publishUsage(snapshot: UsageSnapshot): void {
  for (const listener of listeners) listener(snapshot);
}

export function subscribeUsage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The window that runs out first ("today" before "this week"…), or null when unlimited. */
export function tightestScope(snapshot: UsageSnapshot): UsageScope | null {
  if (snapshot.limit_reached) return snapshot.limit_reached as UsageScope;
  let best: UsageScope | null = null;
  for (const scope of ["day", "week", "month"] as const) {
    const left = snapshot.remaining[scope];
    if (left == null) continue;
    if (best === null || left < (snapshot.remaining[best] ?? Infinity)) best = scope;
  }
  return best;
}

export const SCOPE_PHRASE: Record<UsageScope, string> = {
  day: "today",
  week: "this week",
  month: "this month",
};

/** "today's", "this week's", "this month's" */
export const SCOPE_POSSESSIVE: Record<UsageScope, string> = {
  day: "today's",
  week: "this week's",
  month: "this month's",
};

/** Blocked by a limit right now (staff and unlimited plans never are). */
export function isExhausted(snapshot: UsageSnapshot | undefined | null): boolean {
  return !!snapshot && !snapshot.exempt && !snapshot.allowed;
}
