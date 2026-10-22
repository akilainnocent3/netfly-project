"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useMembership, useUsage, type Membership } from "@/lib/queries";
import { formatCountdown, limitPhrase, useCountdown } from "@/lib/usage-format";
import { planGradient, priceLabel } from "../billing/plan-picker";
import { Button } from "../ui/button";
import { FormActions } from "../ui/form-actions";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";

type Sub = Membership["subscription"];

export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

const STATUS: Record<Sub["status"], { label: string; tone: string }> = {
  free: { label: "Free plan", tone: "bg-white/15 text-white" },
  trialing: { label: "Free trial", tone: "bg-[#46d369]/20 text-[#46d369]" },
  active: { label: "Active", tone: "bg-[#46d369]/20 text-[#46d369]" },
  past_due: { label: "Payment due", tone: "bg-[#e87c03]/20 text-[#ffb35c]" },
  grace: { label: "Payment overdue", tone: "bg-[#e87c03]/20 text-[#ffb35c]" },
  canceled: { label: "Ends soon", tone: "bg-white/15 text-white" },
  expired: { label: "Expired", tone: "bg-[#eb3942]/20 text-[#ff8a92]" },
};

/** What happens next and when (the date the live countdown runs to). */
function nextEvent(sub: Sub, freeName: string): { text: string; at: string | null } {
  const end = sub.current_period_end;
  if (sub.status === "trialing" && sub.trial_end)
    return {
      text: sub.payment_phone_masked
        ? `Your free trial ends on ${longDate(sub.trial_end)}. We'll send a payment request to ${sub.payment_phone_masked} that day.`
        : `Your free trial ends on ${longDate(sub.trial_end)}.`,
      at: sub.trial_end,
    };
  if (sub.status === "past_due" || sub.status === "grace")
    return {
      text: sub.grace_until
        ? `We couldn't take your last payment. You keep your plan until ${longDate(sub.grace_until)}; after that you move to ${freeName}.`
        : "We couldn't take your last payment. We'll try again soon.",
      at: sub.grace_until ?? end,
    };
  if (sub.scheduled_plan && end)
    return { text: `You'll move to ${sub.scheduled_plan.name} on ${longDate(end)}.`, at: end };
  if (sub.status === "canceled" && end)
    return {
      text: `Auto-renew is off. Your plan ends on ${longDate(end)}, then you move to ${freeName}.`,
      at: end,
    };
  if (sub.status === "active" && end) return { text: `Next payment on ${longDate(end)}.`, at: end };
  return { text: "Watch for free every day. Upgrade anytime for more viewing time.", at: null };
}

export function MembershipCard({ detailed = false }: { detailed?: boolean }) {
  const membership = useMembership();
  const data = membership.data;
  if (!data)
    return (
      <div aria-hidden className="bg-surface overflow-hidden rounded-md ring-1 ring-white/8">
        <Skeleton className="h-28 rounded-none" />
        <div className="space-y-3 p-6">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
    );
  return <Card sub={data.subscription} detailed={detailed} />;
}

function Card({ sub, detailed }: { sub: Sub; detailed: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notice = useUsage().data?.notice ?? null;
  const [confirm, setConfirm] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const due = sub.status === "past_due" || sub.status === "grace";

  const renewNow = async () => {
    if (renewing) return;
    setRenewing(true);
    try {
      const payment = await unwrap(api.POST("/api/v1/billing/renew-now", { body: {} }));
      router.push(
        `/payment?payment=${payment.id}&next=${encodeURIComponent("/account/membership")}`,
      );
    } catch (e) {
      toast({
        message: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
        tone: "error",
      });
      setRenewing(false);
    }
  };

  const dismissNotice = async () => {
    setDismissing(true);
    try {
      await unwrap(api.POST("/api/v1/billing/notice/dismiss"));
      await queryClient.invalidateQueries({ queryKey: ["usage"] });
    } catch {
      toast({ message: "Couldn't dismiss. Please try again.", tone: "error" });
    } finally {
      setDismissing(false);
    }
  };
  const plan = sub.plan;
  const freeName = "the free plan";
  const event = nextEvent(sub, freeName);
  const left = useCountdown(event.at);
  const paid = !plan.is_free && sub.status !== "expired";

  const setAutoRenew = async (on: boolean) => {
    try {
      const updated = await unwrap(api.POST("/api/v1/billing/auto-renew", { body: { on } }));
      queryClient.setQueryData<Membership>(["membership"], (m) =>
        m ? { ...m, subscription: updated } : m,
      );
      toast(
        {
          message: on
            ? "Auto-renew is back on. Your plan will renew."
            : `Auto-renew is off. You keep ${plan.name} until ${shortDate(updated.current_period_end ?? new Date().toISOString())}.`,
          tone: "success",
        },
        5000,
      );
    } catch (e) {
      toast({
        message: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
        tone: "error",
      });
      throw e;
    }
  };

  return (
    <section
      data-testid="membership-card"
      className="bg-surface overflow-hidden rounded-md ring-1 ring-white/8"
    >
      <div className="relative px-6 pt-6 pb-5" style={{ background: planGradient(plan.order) }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption rounded-full bg-black/25 px-2.5 py-1 font-bold tracking-wider uppercase">
            Membership
          </span>
          <span
            className={`text-caption rounded-full px-2.5 py-1 font-bold tracking-wide uppercase ${STATUS[sub.status].tone}`}
          >
            {STATUS[sub.status].label}
          </span>
        </div>
        <p className="mt-3 text-[clamp(1.75rem,3vw,2.25rem)] leading-none font-black tracking-tight">
          {plan.name}
        </p>
        <p className="text-lead mt-2 font-semibold" data-testid="membership-price">
          {priceLabel(plan)}
        </p>
      </div>
      <div className="p-6 [--panel-pad:1.5rem]">
        {detailed && notice ? (
          <div
            role="status"
            data-testid="billing-notice"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md bg-[#e87c03]/15 px-4 py-3 ring-1 ring-[#e87c03]/40"
          >
            <p className="text-body text-white">{notice.text}</p>
            <Button
              size="sm"
              variant="secondary"
              loading={dismissing}
              onClick={() => void dismissNotice()}
            >
              Dismiss
            </Button>
          </div>
        ) : null}
        <p className="text-body text-white/90">{event.text}</p>
        {left !== null ? (
          <p className="text-meta mt-2 text-[#b3b3b3]">
            {sub.status === "trialing" ? "Trial ends in " : "In "}
            <span
              className="font-semibold text-white tabular-nums"
              data-testid="membership-countdown"
            >
              {formatCountdown(left)}
            </span>
          </p>
        ) : null}
        <dl className="text-meta mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-[#a3a3a3]">Daily viewing</dt>
            <dd className="text-body font-semibold">
              {limitPhrase(plan.daily_limit_minutes, "day")}
            </dd>
          </div>
          <div>
            <dt className="text-[#a3a3a3]">Weekly viewing</dt>
            <dd className="text-body font-semibold">
              {limitPhrase(plan.weekly_limit_minutes, "week")}
            </dd>
          </div>
          <div>
            <dt className="text-[#a3a3a3]">Monthly viewing</dt>
            <dd className="text-body font-semibold">
              {limitPhrase(plan.monthly_limit_minutes, "month")}
            </dd>
          </div>
        </dl>
        {detailed && sub.payment_phone_masked ? (
          <p className="text-body mt-5 flex items-center gap-2 text-white/85">
            <Smartphone className="size-4 text-[#b3b3b3]" aria-hidden />
            Payment phone: <span className="font-semibold">{sub.payment_phone_masked}</span>
            {sub.payment_network ? (
              <span className="text-[#b3b3b3]">({sub.payment_network})</span>
            ) : null}
          </p>
        ) : null}
        <FormActions>
          {detailed && due ? (
            <Button
              variant="accent"
              className="rounded"
              loading={renewing}
              onClick={() => void renewNow()}
            >
              Renew now
            </Button>
          ) : null}
          {/* One red primary: Renew when a payment is due, else Change plan. */}
          <Button asChild variant={detailed && due ? "secondary" : "accent"} className="rounded">
            <Link href="/signup/plan?from=account">Change plan</Link>
          </Button>
          {detailed && paid ? (
            sub.auto_renew ? (
              <Button variant="secondary" className="rounded" onClick={() => setConfirm(true)}>
                {sub.status === "trialing" ? "Cancel trial" : "Cancel auto-renew"}
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="rounded"
                loading={resuming}
                onClick={async () => {
                  setResuming(true);
                  await setAutoRenew(true).catch(() => undefined);
                  setResuming(false);
                }}
              >
                {sub.status === "trialing" ? "Keep my plan after the trial" : "Resume auto-renew"}
              </Button>
            )
          ) : null}
        </FormActions>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={sub.status === "trialing" ? "Cancel your free trial?" : "Turn off auto-renew?"}
        confirmLabel={sub.status === "trialing" ? "Cancel trial" : "Turn off auto-renew"}
        destructive
        onConfirm={() => setAutoRenew(false)}
      >
        {sub.status === "trialing"
          ? `You keep ${plan.name} until your trial ends, and we won't send a payment request. Then you move to ${freeName}.`
          : `You keep ${plan.name} until ${sub.current_period_end ? longDate(sub.current_period_end) : "the end of this period"}. After that you move to ${freeName}. You can turn it back on anytime before then.`}
      </ConfirmDialog>
    </section>
  );
}
