"use client";

import { cn } from "@netfly/ui";
import { usePayments } from "@/lib/queries";
import { formatTzs } from "@/lib/usage-format";
import { Skeleton } from "../ui/skeleton";
import { AccountPanel } from "./account-nav";

const STATUS: Record<string, { label: string; tone: string }> = {
  completed: { label: "Paid", tone: "text-[#46d369]" },
  pending: { label: "Waiting for approval", tone: "text-[#ffb35c]" },
  created: { label: "Waiting for approval", tone: "text-[#ffb35c]" },
  failed: { label: "Not approved", tone: "text-[#ff8a92]" },
  expired: { label: "Expired", tone: "text-[#b3b3b3]" },
  voided: { label: "Cancelled", tone: "text-[#b3b3b3]" },
};

const PURPOSE: Record<string, string> = {
  signup: "New plan",
  upgrade: "Plan change",
  renewal: "Renewal",
  trial_conversion: "After free trial",
};

/** Account → Membership: every mobile-money request, newest first. */
export function PaymentHistory() {
  const payments = usePayments();
  return (
    <AccountPanel
      title="Payment history"
      description="Mobile-money payments for your membership."
      testId="payment-history"
    >
      {!payments.data ? (
        <Skeleton className="h-24 rounded" />
      ) : payments.data.length === 0 ? (
        <p className="text-body text-[#b3b3b3]">No payments yet.</p>
      ) : (
        <ul className="divide-y divide-white/8">
          {payments.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
              <span className="text-meta w-28 text-[#b3b3b3] tabular-nums">
                {new Date(p.created_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="text-body min-w-0 flex-1">
                <span className="font-semibold">{p.plan}</span>{" "}
                <span className="text-[#b3b3b3]">
                  · {PURPOSE[p.purpose] ?? p.purpose} · {p.phone_masked}
                </span>
              </span>
              <span className="text-body font-semibold tabular-nums">{formatTzs(p.amount)}</span>
              <span className={cn("text-meta w-40 text-right", STATUS[p.status]?.tone)}>
                {STATUS[p.status]?.label ?? p.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AccountPanel>
  );
}
