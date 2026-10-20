"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSubmitStatus = "idle" | "waiting" | "submitting" | "failed" | "done";

interface Options<V> {
  values: V;
  isValid: boolean;
  /** Idle time after the last keystroke before submitting (from `ux.autosubmit_delay_ms`). */
  delay: number;
  onSubmit: (values: V) => Promise<boolean>;
  enabled?: boolean;
}

/**
 * Auto-submit pattern used by every short form:
 * - submits once all fields are valid and the user paused typing for `delay` ms;
 * - never submits the same values twice automatically;
 * - after a failure, waits until a field changes before auto-submitting again;
 * - `submitNow()` (Enter / fallback button) submits immediately.
 */
export function useAutoSubmit<V>({ values, isValid, delay, onSubmit, enabled = true }: Options<V>) {
  const [status, setStatus] = useState<AutoSubmitStatus>("idle");
  const attempted = useRef<string | null>(null);
  const busy = useRef(false);
  const latest = useRef(onSubmit);
  latest.current = onSubmit;
  const key = JSON.stringify(values);

  const run = useCallback(
    async (snapshot: V, snapshotKey: string) => {
      if (busy.current) return;
      busy.current = true;
      attempted.current = snapshotKey;
      setStatus("submitting");
      try {
        const ok = await latest.current(snapshot);
        setStatus(ok ? "done" : "failed");
      } catch {
        setStatus("failed");
      } finally {
        busy.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !isValid || busy.current || attempted.current === key) {
      if (attempted.current !== key && status === "waiting") setStatus("idle");
      return;
    }
    setStatus("waiting");
    const snapshot = values;
    const timer = setTimeout(() => void run(snapshot, key), delay);
    return () => clearTimeout(timer);
    // `values` is represented by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isValid, enabled, delay, run]);

  const submitNow = useCallback(() => {
    if (!isValid || busy.current) return;
    void run(values, key);
  }, [isValid, values, key, run]);

  return { status, submitNow, submitting: status === "submitting" };
}
