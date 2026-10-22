"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RegistrationShell, StepHeading } from "@/components/auth/registration-shell";
import { PlanPicker, priceLabel } from "@/components/billing/plan-picker";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useGoAfterAuth } from "@/lib/after-auth";
import { SkeletonArea } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { setFlash } from "@/lib/flash";
import { useMembership, usePlans } from "@/lib/queries";
import { safeNext } from "@/lib/safe-next";

/**
 * "Choose the plan that's right for you". Free is preselected for new members (and applies at
 * once: no email, phone or payment). Paid plans and trials continue to verification / payment.
 * Also opened from Account → Change plan (`?from=account`).
 */
export default function PlanPage() {
  const goAfterAuth = useGoAfterAuth();
  const params = useSearchParams();
  const fromAccount = params.get("from") === "account";
  const next = safeNext(params.get("next"), fromAccount ? "/account/membership" : "/browse");
  const router = useRouter();
  const toast = useToast();
  const config = useConfig();
  const queryClient = useQueryClient();
  const plans = usePlans();
  const membership = useMembership();
  const list = useMemo(() => plans.data?.plans ?? [], [plans.data]);
  const current = membership.data?.subscription.plan.slug ?? null;
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState<"plan" | "trial" | null>(null);

  // Free is preselected for new members; changing a plan starts from the current one.
  useEffect(() => {
    if (selected || !list.length || membership.isPending) return;
    const preferred = params.get("plan");
    const free = list.find((p) => p.is_default) ?? list[0];
    setSelected(
      (preferred && list.some((p) => p.slug === preferred) && preferred) ||
        (fromAccount && current) ||
        free!.slug,
    );
  }, [list, selected, membership.isPending, fromAccount, current, params]);

  const plan = list.find((p) => p.slug === selected);
  const trialOffered =
    !!plan &&
    !plan.is_free &&
    !!plans.data?.trial_enabled &&
    plan.trial_eligible &&
    !!membership.data?.trial.eligible;

  const choose = async (trial: boolean) => {
    if (!plan || busy) return;
    setBusy(trial ? "trial" : "plan");
    try {
      const result = await unwrap(
        api.POST("/api/v1/billing/plan", { body: { plan: plan.slug, trial } }),
      );
      void queryClient.invalidateQueries({ queryKey: ["membership"] });
      void queryClient.invalidateQueries({ queryKey: ["usage"] });
      if (result.status === "needs") {
        const q = new URLSearchParams({ plan: plan.slug, next });
        if (trial) q.set("trial", "1");
        router.push(`/verify?${q.toString()}`);
        return;
      }
      if (result.status === "scheduled") {
        const end = result.subscription.current_period_end;
        setFlash(
          `You'll move to ${plan.name}${end ? ` on ${new Date(end).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : " at the end of your billing period"}.`,
        );
      } else {
        setFlash(
          fromAccount
            ? `You're on ${plan.name} now.`
            : `Welcome to ${config.str("branding.site_name", "NETFLY")}! Enjoy watching.`,
        );
      }
      goAfterAuth(next);
    } catch (e) {
      toast({
        message: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
        tone: "error",
      });
      setBusy(null);
    }
  };

  const unchanged = fromAccount && plan?.slug === current;
  return (
    <RegistrationShell wide>
      <div className="mx-auto w-full max-w-[440px] md:max-w-none">
        <StepHeading title="Choose the plan that's right for you">
          Every plan streams in the best quality. Plans differ only in how much you can watch.
        </StepHeading>
      </div>
      {plans.isPending || membership.isPending ? (
        <SkeletonArea loaderClassName="bottom-auto h-96">
          <div className="grid gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl bg-[#eee]" />
            ))}
          </div>
        </SkeletonArea>
      ) : (
        <PlanPicker plans={list} selected={selected} current={current} onSelect={setSelected} />
      )}
      <p className="text-meta mt-5 text-[#737373]">
        Upgrade, downgrade or cancel anytime. Prices in Tanzanian shillings; paid plans renew every{" "}
        {plan?.period_days ?? 30} days until you cancel. Watching time is counted only while a title
        plays — browsing is always free.
      </p>
      <div className="sticky bottom-0 -mx-[max(4vw,16px)] mt-6 flex flex-col items-center gap-3 bg-white px-[max(4vw,16px)] pt-3 pb-[max(16px,env(safe-area-inset-bottom))] md:static md:mx-0 md:bg-transparent md:p-0">
        {plan?.is_free ? (
          <Button
            variant="accent-light"
            size="lg"
            className="text-h3 h-14 w-full max-w-[440px] font-medium"
            loading={busy === "plan"}
            disabled={!plan || unchanged}
            onClick={() => void choose(false)}
          >
            {fromAccount
              ? unchanged
                ? "Your current plan"
                : `Switch to ${plan.name}`
              : "Start watching"}
          </Button>
        ) : trialOffered ? (
          <>
            <Button
              variant="accent-light"
              size="lg"
              className="text-h3 h-14 w-full max-w-[440px] font-medium"
              loading={busy === "trial"}
              disabled={busy !== null}
              onClick={() => void choose(true)}
            >
              Start free trial
            </Button>
            <Button
              variant="ghost-light"
              loading={busy === "plan"}
              disabled={busy !== null}
              onClick={() => void choose(false)}
              className="text-body font-normal underline underline-offset-2"
            >
              Skip the trial — pay {plan ? priceLabel(plan) : ""} now
            </Button>
          </>
        ) : (
          <Button
            variant="accent-light"
            size="lg"
            className="text-h3 h-14 w-full max-w-[440px] font-medium"
            loading={busy === "plan"}
            disabled={!plan || unchanged}
            onClick={() => void choose(false)}
          >
            {unchanged ? "Your current plan" : "Next"}
          </Button>
        )}
      </div>
    </RegistrationShell>
  );
}
