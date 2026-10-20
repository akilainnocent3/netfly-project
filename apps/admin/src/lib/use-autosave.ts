"use client";

import { ApiError } from "@netfly/api-client";
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Long-form autosave: local edits are batched and PATCHed every `delay` ms of
 * inactivity. Returns field errors from the API so they can be shown inline.
 */
export function useAutosave<T extends Record<string, unknown>>(
  save: (patch: Partial<T>) => Promise<unknown>,
  delay = 1500,
) {
  const [state, setState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setState("saving");
    try {
      await saveRef.current(patch);
      setErrors((e) => {
        const next = { ...e };
        for (const key of Object.keys(patch)) delete next[key];
        return next;
      });
      setState(Object.keys(pending.current).length ? "dirty" : "saved");
    } catch (error) {
      const fields = error instanceof ApiError ? error.fields : {};
      setErrors((e) => ({
        ...e,
        ...(Object.keys(fields).length
          ? fields
          : { form: error instanceof Error ? error.message : "Save failed" }),
      }));
      setState("error");
    }
  }, []);

  const queue = useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...pending.current, ...patch };
      setState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      void flush();
    };
  }, [flush]);

  return { state, errors, queue, flush };
}
