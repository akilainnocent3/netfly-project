"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Keeps what someone typed before the page hydrated. React leaves a controlled input's DOM value
 * alone while hydrating, then the next render writes its own (empty) state over it — so on a slow
 * phone a quick typist would lose their first characters. On mount this hands any such text to
 * `onChange` once. Returns the ref to put on the input (it forwards to `forwarded`).
 */
export function useEarlyInput(
  forwarded: React.ForwardedRef<HTMLInputElement>,
  value: React.InputHTMLAttributes<HTMLInputElement>["value"],
  onChange: React.ChangeEventHandler<HTMLInputElement> | undefined,
) {
  const el = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const input = el.current;
    if (!input || value === undefined || !onChange) return;
    if (input.value && input.value !== String(value)) {
      onChange({ target: input, currentTarget: input } as React.ChangeEvent<HTMLInputElement>);
    }
    // Mount only: afterwards React owns the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useCallback(
    (node: HTMLInputElement | null) => {
      el.current = node;
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded],
  );
}
