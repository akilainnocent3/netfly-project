"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { priceLabel } from "@netfly/ui";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RegistrationShell, StepActions, StepHeading } from "@/components/auth/registration-shell";
import { Approval, Success } from "@/components/checkout/approval";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { NetworkChip, PhoneField, phoneForApi } from "@/components/verify/phone-field";
import { useGoAfterAuth } from "@/lib/after-auth";
import { api } from "@/lib/api";
import { readCheckout, stepHref } from "@/lib/checkout";
import { setFlash } from "@/lib/flash";
import { maskPhone, NETWORKS, networkOf, normalizePhone, type Network } from "@/lib/phone";
import { useCheckout, usePayment, type Payment } from "@/lib/queries";
import { formatTzs } from "@/lib/usage-format";

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

type Stage =
  | { kind: "setup" }
  | { kind: "approve"; paymentId: string; startedAt: number }
  | { kind: "paid"; payment: Payment; periodEnd: string | null }
  | { kind: "trial"; trialEnd: string; phone: string };

/**
 * STEP 3 OF 3 · Set up your payment (or start the free trial): plan summary, the mobile-money
 * network from the payment phone, the price and the legal line, then the push request and
 * "Check your phone" until the webhook (or reconcile) settles it. Success resumes what the
 * member came for.
 */
export function PaymentFlow() {
  const goAfterAuth = useGoAfterAuth();
  const params = useSearchParams();
  const ctx = readCheckout(params);
  const router = useRouter();
  const toast = useToast();
  const config = useConfig();
  const queryClient = useQueryClient();
  const checkout = useCheckout(ctx.plan, ctx.trial);
  const site = config.str("branding.site_name", "NETFLY");
  const timeout = config.num("payments.approve_timeout_seconds", 120);
  const pollMs = config.num("payments.poll_seconds", 3) * 1000;
  const existing = params.get("payment");
  const [stage, setStage] = useState<Stage>(
    existing ? { kind: "approve", paymentId: existing, startedAt: Date.now() } : { kind: "setup" },
  );
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("255");
  const [phoneError, setPhoneError] = useState("");
  const [busy, setBusy] = useState(false);
  const prefilled = useRef(false);

  // A step still to do (opened directly, or verification lapsed): go there first.
  useEffect(() => {
    const data = checkout.data;
    if (!data) return;
    const first = data.steps[0];
    if (first === "email" || first === "phone") router.replace(stepHref(first, ctx));
    if (!prefilled.current && data.payment_phone) {
      prefilled.current = true;
      setPhone(`0${data.payment_phone.slice(3)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.data]);

  const payment = usePayment(stage.kind === "approve" ? stage.paymentId : null, pollMs);
  useEffect(() => {
    const p = payment.data;
    if (stage.kind !== "approve" || !p || p.status !== "completed") return;
    void queryClient.invalidateQueries({ queryKey: ["membership"] });
    void queryClient.invalidateQueries({ queryKey: ["usage"] });
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
    void unwrap(api.GET("/api/v1/billing/membership")).then(
      (m) =>
        setStage({
          kind: "paid",
          payment: p,
          periodEnd: m.subscription.current_period_end ?? null,
        }),
      () => setStage({ kind: "paid", payment: p, periodEnd: null }),
    );
  }, [payment.data, stage.kind, queryClient]);

  const plan = checkout.data?.plan;
  const normalized = normalizePhone(phone, country);
  const network = networkOf(normalized);
  const trialDays = checkout.data?.trial_days ?? 7;
  const trialEnd = new Date(Date.now() + trialDays * 86_400_000).toISOString();

  const start = async () => {
    if (busy || !plan) return;
    if (!normalized || !normalized.startsWith("255")) {
      setPhoneError("Enter a Tanzanian mobile-money number like 0712 345 678.");
      return;
    }
    setBusy(true);
    setPhoneError("");
    try {
      const result = await unwrap(
        api.POST("/api/v1/billing/checkout/start", {
          body: { plan: plan.slug, trial: ctx.trial, phone: phoneForApi(phone, country) },
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ["membership"] });
      void queryClient.invalidateQueries({ queryKey: ["usage"] });
      if (result.kind === "trial") {
        setStage({
          kind: "trial",
          trialEnd: result.subscription.trial_end ?? trialEnd,
          phone: result.subscription.payment_phone_masked || maskPhone(normalized),
        });
      } else if (result.payment) {
        queryClient.setQueryData(["payment", result.payment.id], result.payment);
        setStage({ kind: "approve", paymentId: result.payment.id, startedAt: Date.now() });
      }
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.code === "verification_required") router.replace(stepHref("email", ctx));
      else if (err?.code === "validation_error") setPhoneError(err.message);
      else
        toast({
          message: err?.message ?? "Something went wrong. Please try again.",
          tone: "error",
        });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || stage.kind !== "approve") return;
    setBusy(true);
    try {
      const next = await unwrap(
        api.POST("/api/v1/billing/payments/{payment_id}/resend", {
          params: { path: { payment_id: stage.paymentId } },
          body: {},
        }),
      );
      queryClient.setQueryData(["payment", next.id], next);
      setStage({ kind: "approve", paymentId: next.id, startedAt: Date.now() });
      toast({ message: `We sent a new request to ${next.phone_masked}.` });
    } catch (e) {
      toast({
        message: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const finish = (message: string) => {
    setFlash(message);
    goAfterAuth(ctx.next);
  };

  if (stage.kind === "approve") {
    return (
      <RegistrationShell>
        {payment.data ? (
          <Approval
            payment={payment.data}
            timeoutSeconds={timeout}
            startedAt={stage.startedAt}
            resending={busy}
            onResend={() => void resend()}
            onChangeNumber={() => setStage({ kind: "setup" })}
          />
        ) : (
          <div className="grid flex-1 place-items-center" aria-busy>
            <Spinner className="size-8 text-[#e50914]" label="Loading" />
          </div>
        )}
      </RegistrationShell>
    );
  }
  if (stage.kind === "paid") {
    return (
      <RegistrationShell>
        <Success
          title="You're all set"
          action={
            <Button
              variant="accent-light"
              size="lg"
              fullWidth
              className="text-h3 h-14 font-medium"
              onClick={() => finish(`Welcome to ${stage.payment.plan}! Enjoy watching.`)}
            >
              Start watching
            </Button>
          }
        >
          Your <b>{stage.payment.plan}</b> plan is active.
          {stage.periodEnd ? (
            <>
              {" "}
              Your next payment is on <b data-testid="next-billing">{longDate(stage.periodEnd)}</b>.
            </>
          ) : null}
        </Success>
      </RegistrationShell>
    );
  }
  if (stage.kind === "trial") {
    return (
      <RegistrationShell>
        <Success
          title="Your free trial has started"
          action={
            <Button
              variant="accent-light"
              size="lg"
              fullWidth
              className="text-h3 h-14 font-medium"
              onClick={() => finish(`Enjoy your free trial of ${plan?.name}!`)}
            >
              Start watching
            </Button>
          }
        >
          Enjoy <b>{plan?.name}</b> until <b data-testid="trial-end">{shortDate(stage.trialEnd)}</b>
          . We&apos;ll send a payment request to <b>{stage.phone}</b> on {shortDate(stage.trialEnd)}
          .
        </Success>
      </RegistrationShell>
    );
  }

  const price = plan ? priceLabel(plan) : "";
  const cta = ctx.trial ? "Start free trial" : plan ? `Pay ${formatTzs(plan.price_tzs)}` : "Pay";
  return (
    <RegistrationShell>
      {!plan ? (
        checkout.error ? (
          <>
            <StepHeading title="Let's pick your plan again">
              {checkout.error instanceof ApiError
                ? checkout.error.message
                : "Something went wrong."}
            </StepHeading>
            <Button asChild variant="accent-light" size="lg" fullWidth className="text-h3 h-14">
              <Link href={`/signup/plan?next=${encodeURIComponent(ctx.next)}`}>Choose a plan</Link>
            </Button>
          </>
        ) : (
          <div className="grid flex-1 place-items-center" aria-busy>
            <Spinner className="size-8 text-[#e50914]" label="Loading" />
          </div>
        )
      ) : (
        <form
          noValidate
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <StepHeading
            step={3}
            of={3}
            title={ctx.trial ? "Start your free trial" : "Set up your payment"}
          >
            {ctx.trial
              ? `Free for ${trialDays} days. We'll ask for payment on your phone when it ends — cancel anytime before then.`
              : "Pay with mobile money. You'll approve it with your PIN on your phone."}
          </StepHeading>
          <div
            className="flex items-center justify-between gap-4 rounded-[4px] bg-[#f4f4f4] px-4 py-3"
            data-testid="plan-summary"
          >
            <div>
              <p className="text-body font-bold text-[#333]">{plan.name}</p>
              <p className="text-meta text-[#595959]">
                {ctx.trial ? `${trialDays} days free, then ${price}` : price}
              </p>
            </div>
            <Link
              href={`/signup/plan?plan=${plan.slug}&next=${encodeURIComponent(ctx.next)}`}
              className="text-body rounded font-bold text-[#0062cc] hover:underline focus-visible:outline-2 focus-visible:outline-[#0071eb]"
            >
              Change
            </Link>
          </div>
          <p className="text-meta mt-6 mb-2 font-semibold text-[#333]">Mobile money</p>
          <ul className="mb-4 flex flex-wrap gap-2" aria-label="Supported networks">
            {(Object.keys(NETWORKS) as Network[]).map((n) => (
              <li key={n}>
                <NetworkChip network={n} selected={network === n} />
              </li>
            ))}
          </ul>
          <PhoneField
            label="Payment phone number"
            showNetwork={false}
            country={country}
            onCountryChange={setCountry}
            value={phone}
            onChange={(v) => {
              setPhone(v);
              setPhoneError("");
            }}
            error={phoneError}
          />
          <div className="mt-5 flex items-baseline justify-between border-t border-[#e6e6e6] pt-4">
            <span className="text-body text-[#333]">{ctx.trial ? "Due today" : "Total"}</span>
            <span className="text-h3 font-bold text-[#333]" data-testid="due-today">
              {ctx.trial ? formatTzs(0) : formatTzs(plan.price_tzs)}
            </span>
          </div>
          <p className="text-meta mt-4 text-[#595959]">
            By clicking “{cta}”, you agree to our{" "}
            <Link href="/legal/terms" className="text-[#0062cc] underline underline-offset-2">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="text-[#0062cc] underline underline-offset-2">
              Privacy Policy
            </Link>
            .{" "}
            {ctx.trial
              ? `Your free trial lasts ${trialDays} days. On ${shortDate(trialEnd)} ${site} will send a payment request for ${formatTzs(plan.price_tzs)} to this number, then every ${plan.period_days} days until you cancel.`
              : `${site} will request ${formatTzs(plan.price_tzs)} from this number now, and it renews every ${plan.period_days} days until you cancel.`}{" "}
            Cancel anytime in Account.
          </p>
          <StepActions>
            <Button
              type="submit"
              variant="accent-light"
              size="lg"
              fullWidth
              loading={busy}
              className="text-h3 h-14 font-medium"
            >
              {cta}
            </Button>
          </StepActions>
        </form>
      )}
    </RegistrationShell>
  );
}
