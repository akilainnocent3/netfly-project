"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { safeNext } from "@/lib/safe-next";

const KEY = "netfly-signup-draft";

interface Draft {
  name: string;
  username: string;
  /** Server-side errors mapped back to the step that owns the field. */
  errors: Partial<Record<"name" | "username" | "password", string>>;
}

interface DraftValue extends Draft {
  set: (patch: Partial<Draft>) => void;
  /** `next` carried through every step (validated). */
  next: string;
  /** A step URL that keeps `next`. */
  href: (path: string) => string;
  ready: boolean;
}

const DraftContext = createContext<DraftValue | null>(null);

/**
 * Values typed on earlier steps survive Back/Forward and reloads (sessionStorage). The password
 * is never stored anywhere: it lives only in the password step's own state.
 */
export function SignupDraftProvider({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const rawNext = params.get("next");
  const next = rawNext ? safeNext(rawNext, "") : "";
  const [draft, setDraft] = useState<Draft>({ name: "", username: "", errors: {} });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<Draft> | null;
      if (saved)
        setDraft((d) => ({
          ...d,
          name: typeof saved.name === "string" ? saved.name.slice(0, 120) : "",
          username: typeof saved.username === "string" ? saved.username.slice(0, 30) : "",
        }));
    } catch {
      /* private mode: steps still work within this page */
    }
    setReady(true);
  }, []);

  const set = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => {
      const updated = { ...d, ...patch };
      try {
        sessionStorage.setItem(
          KEY,
          JSON.stringify({ name: updated.name, username: updated.username }),
        );
      } catch {
        /* ignore */
      }
      return updated;
    });
  }, []);

  const href = useCallback(
    (path: string) => (next ? `${path}?next=${encodeURIComponent(next)}` : path),
    [next],
  );
  const value = useMemo(
    () => ({ ...draft, set, next, href, ready }),
    [draft, set, next, href, ready],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useSignupDraft(): DraftValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useSignupDraft must be used inside the signup layout");
  return value;
}

export function clearSignupDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
