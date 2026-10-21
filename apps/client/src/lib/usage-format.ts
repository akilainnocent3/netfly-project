"use client";

import { useEffect, useMemo, useState } from "react";

export { formatTzs, limitPhrase } from "@netfly/ui";

/** "2h 14m", "45m", "30s" */
export function formatLeft(seconds: number | null | undefined): string {
  if (seconds == null) return "Unlimited";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/** "1:00", "0:42" — short countdowns (resend timers). */
export function formatShortCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "05:12:09", or "3d 05:12:09" beyond a day. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const clock = [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  return d ? `${d}d ${clock}` : clock;
}

/**
 * Milliseconds until `target`, ticking every second. `serverTime` (from the same response)
 * corrects for a device clock that is off, so the countdown matches the server's reset.
 */
export function useCountdown(target: string | null | undefined, serverTime?: string | null) {
  // Re-measured whenever a fresh snapshot (new server_time) arrives.
  const offset = useMemo(
    () => (serverTime ? new Date(serverTime).getTime() - Date.now() : 0),
    [serverTime],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  return Math.max(0, new Date(target).getTime() - (now + offset));
}
