"use client";

import { cn } from "@netfly/ui";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";

export interface CodeInputHandle {
  focus: () => void;
  /** Fill every box (paste, iOS suggestion, WebOTP) — completes like typing would. */
  fill: (code: string) => void;
}

/**
 * Netflix-style code entry: one labelled group of single-digit boxes. Typing advances, Backspace
 * goes back, paste (or the iOS "From Messages" suggestion, or WebOTP) fills every box, and a
 * full code submits itself via `onComplete` — the only auto-submit in the app, because a code
 * has nothing left to edit once all its digits are in.
 */
export const CodeInput = forwardRef<
  CodeInputHandle,
  {
    length: number;
    value: string;
    onChange: (value: string) => void;
    onComplete: (code: string) => void;
    label: string;
    error?: string;
    disabled?: boolean;
    /** Dark boxes for the sign-in card (forgot password). */
    tone?: "light" | "dark";
  }
>(function CodeInput(
  { length, value, onChange, onComplete, label, error, disabled, tone = "light" },
  ref,
) {
  const id = useId();
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete(clean);
    return clean;
  };
  /** Fill from a whole code: move the caret first, so `onComplete` may move focus on. */
  const fillAll = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, length);
    boxes.current[Math.min(clean.length, length - 1)]?.focus();
    set(clean);
  };
  useImperativeHandle(ref, () => ({
    focus: () => boxes.current[Math.min(value.length, length - 1)]?.focus(),
    fill: fillAll,
  }));
  // After a wrong code the boxes are cleared: start again at the first one.
  useEffect(() => {
    if (error && !value) boxes.current[0]?.focus();
  }, [error, value]);

  return (
    <div>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        className="flex justify-between gap-2 sm:gap-3"
      >
        <span id={`${id}-label`} className="sr-only">
          {label}
        </span>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={!!error || undefined}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={i === 0 ? length : 1}
            disabled={disabled}
            value={digit}
            data-testid={`code-digit-${i}`}
            onFocus={(e) => e.currentTarget.select()}
            onPaste={(e) => {
              e.preventDefault();
              fillAll(e.clipboardData.getData("text"));
            }}
            onChange={(e) => {
              const typed = e.target.value.replace(/\D/g, "");
              if (typed.length > 1) {
                // iOS / Android suggestion or a pasted code landed in one box.
                fillAll(typed);
                return;
              }
              const next = (value.slice(0, i) + typed + value.slice(i + 1)).slice(0, length);
              if (typed && i < length - 1) boxes.current[i + 1]?.focus();
              set(typed ? next : value.slice(0, i));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) {
                e.preventDefault();
                set(value.slice(0, i - 1));
                boxes.current[i - 1]?.focus();
              } else if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
              else if (e.key === "ArrowRight" && i < length - 1) boxes.current[i + 1]?.focus();
            }}
            className={cn(
              "h-14 w-full max-w-14 min-w-0 rounded-[4px] border text-center text-2xl font-bold tabular-nums transition-shadow duration-150 outline-none disabled:opacity-60 sm:h-16",
              tone === "light"
                ? "bg-white text-[#333] caret-[#0071eb] focus:shadow-[0_0_0_2px_#fff,0_0_0_4px_#0071eb]"
                : "bg-[rgb(22_22_22/0.7)] text-white caret-white focus:shadow-[0_0_0_2px_#fff]",
              error
                ? "border-[#e50914]"
                : tone === "light"
                  ? digit
                    ? "border-[#333]"
                    : "border-[#8c8c8c]"
                  : "border-[rgb(128_128_128/0.7)]",
            )}
          />
        ))}
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className={cn("text-meta mt-2", tone === "light" ? "text-[#b20710]" : "text-[#ff6b72]")}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
});

/**
 * Android Chrome: read the code from the incoming SMS (WebOTP; the SMS ends with
 * "@domain #code"). Aborted when the screen goes away; elsewhere it's a no-op.
 */
export function useWebOtp(enabled: boolean, onCode: (code: string) => void) {
  const handler = useRef(onCode);
  handler.current = onCode;
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("OTPCredential" in window)) return;
    const abort = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: abort.signal } as CredentialRequestOptions)
      .then((credential) => {
        const code = (credential as (Credential & { code?: string }) | null)?.code;
        if (code) handler.current(code);
      })
      .catch(() => undefined); // dismissed, aborted or unsupported: manual entry stays
    return () => abort.abort();
  }, [enabled]);
}
