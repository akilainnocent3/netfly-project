"use client";

import { cn } from "@netfly/ui";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatTzs } from "@/lib/usage-format";
import type { Payment } from "@/lib/queries";

/** A phone with a mobile-money PIN prompt, gently pulsing (still under reduced motion). */
function PhoneArt() {
  return (
    <div aria-hidden className="relative mx-auto h-44 w-28">
      <span className="absolute inset-0 rounded-[22px] bg-[#e50914]/10 motion-safe:animate-ping motion-safe:[animation-duration:2.4s]" />
      <svg viewBox="0 0 112 176" className="relative h-full w-full">
        <rect x="4" y="2" width="104" height="172" rx="18" fill="#141414" />
        <rect x="11" y="16" width="90" height="140" rx="6" fill="#f4f4f4" />
        <rect x="44" y="7" width="24" height="4" rx="2" fill="#3a3a3a" />
        <rect x="19" y="44" width="74" height="70" rx="6" fill="#fff" stroke="#d6d6d6" />
        <rect x="27" y="54" width="44" height="6" rx="3" fill="#333" />
        <rect x="27" y="66" width="58" height="5" rx="2.5" fill="#b3b3b3" />
        <rect x="27" y="86" width="58" height="14" rx="3" fill="#fff" stroke="#8c8c8c" />
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={i}
            cx={37 + i * 13}
            cy="93"
            r="2.6"
            fill="#333"
            className="motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
        <rect x="35" y="124" width="42" height="12" rx="6" fill="#e50914" />
      </svg>
    </div>
  );
}

/** The 120 s window drawn as a ring that empties. */
function Ring({ fraction, seconds }: { fraction: number; seconds: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-16" role="timer" aria-label={`${seconds} seconds left`}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e6e6e6" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#e50914"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="text-body absolute inset-0 grid place-items-center font-bold text-[#333] tabular-nums">
        {seconds}
      </span>
    </div>
  );
}

/**
 * "Check your phone": the push (USSD) request is on its way to the member's phone. Shows who
 * to approve, how much, and a 120 s ring; offers Resend / Use another number when it runs out.
 */
export function Approval({
  payment,
  timeoutSeconds,
  startedAt,
  onResend,
  onChangeNumber,
  resending,
}: {
  payment: Payment;
  timeoutSeconds: number;
  startedAt: number;
  onResend: () => void;
  onChangeNumber: () => void;
  resending: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil(timeoutSeconds - (now - startedAt) / 1000));
  const failed = ["failed", "expired", "voided"].includes(payment.status);
  const timedOut = !failed && left === 0;
  return (
    <div className="flex flex-1 flex-col items-center text-center" data-testid="approval">
      <PhoneArt />
      <h1 className="mt-8 text-[clamp(1.75rem,4vw,2rem)] leading-tight font-bold tracking-tight text-[#333]">
        {failed ? "The payment didn't go through" : "Check your phone"}
      </h1>
      {failed ? (
        <p
          role="alert"
          className="text-lead mt-3 flex items-start gap-2 text-left text-[#b20710]"
          data-testid="payment-failure"
        >
          <CircleAlert className="mt-1 size-5 shrink-0" aria-hidden />
          {payment.failure_reason || "The request wasn't approved."}
        </p>
      ) : (
        <p className="text-lead mt-3 max-w-sm text-[#333]" aria-live="polite">
          Enter your PIN on <b>{payment.phone_masked}</b> to approve{" "}
          <b>{formatTzs(payment.amount)}</b>.
        </p>
      )}
      {!failed && !timedOut ? (
        <div className="mt-8">
          <Ring fraction={left / timeoutSeconds} seconds={left} />
          <p className="text-meta mt-3 text-[#595959]" aria-live="polite">
            Waiting for your approval…
          </p>
        </div>
      ) : null}
      {timedOut ? (
        <p className="text-body mt-6 max-w-sm text-[#595959]">
          Didn&apos;t get the request, or it timed out? Send it again — you&apos;ll only be charged
          once.
        </p>
      ) : null}
      {failed || timedOut ? (
        <div className={cn("mt-8 flex w-full max-w-[440px] flex-col gap-3")}>
          <Button
            variant="accent-light"
            size="lg"
            fullWidth
            loading={resending}
            onClick={onResend}
            className="text-h3 h-14 font-medium"
          >
            {failed ? "Try again" : "Resend request"}
          </Button>
          <Button variant="ghost-light" onClick={onChangeNumber} className="text-body">
            Use another number
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Netflix-style success: a drawn check, then the one thing to do next. */
export function Success({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center text-center" data-testid="checkout-success">
      <svg viewBox="0 0 80 80" className="size-20" aria-hidden>
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="#46d369"
          strokeWidth="5"
          strokeDasharray="227"
          strokeDashoffset="227"
          className="motion-safe:animate-[draw_0.5s_ease-out_forwards] motion-reduce:[stroke-dashoffset:0]"
        />
        <path
          d="M24 41 l11 11 l22 -24"
          fill="none"
          stroke="#46d369"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="60"
          strokeDashoffset="60"
          className="motion-safe:animate-[draw_0.35s_ease-out_0.4s_forwards] motion-reduce:[stroke-dashoffset:0]"
        />
      </svg>
      <h1 className="mt-6 text-[clamp(1.75rem,4vw,2rem)] leading-tight font-bold tracking-tight text-[#333]">
        {title}
      </h1>
      <div className="text-lead mt-3 max-w-md text-[#333]">{children}</div>
      <div className="mt-8 w-full max-w-[440px]">{action}</div>
    </div>
  );
}
