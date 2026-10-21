"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RegistrationShell, StepActions, StepHeading } from "@/components/auth/registration-shell";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { LightField } from "@/components/ui/light-field";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { formatShortCountdown } from "@/lib/usage-format";
import { checkoutQuery, readCheckout, STEP_NUMBER, stepHref } from "@/lib/checkout";
import { networkOf } from "@/lib/phone";
import { useVerifyStatus, type CodeSent } from "@/lib/queries";
import { CodeInput, useWebOtp, type CodeInputHandle } from "./code-input";
import { NetworkChip, PhoneField, phoneForApi } from "./phone-field";

type Channel = "email" | "phone";

const COPY: Record<
  Channel,
  { title: string; help: string; noun: string; change: string; done: string }
> = {
  email: {
    title: "What's your email?",
    help: "We'll send you a code to confirm it. We use it for receipts and to help you get back into your account.",
    noun: "email",
    change: "Change email",
    done: "Email verified",
  },
  phone: {
    title: "What's your mobile number?",
    help: "We'll text you a code. Use the number you pay with — M-Pesa, Airtel Money, Mixx by Yas or Halotel.",
    noun: "phone number",
    change: "Use a different number",
    done: "Phone number verified",
  },
};

/** 255712345678 → 0712345678 for the input. */
const localPhone = (digits: string) =>
  digits.startsWith("255") && digits.length === 12 ? `0${digits.slice(3)}` : `+${digits}`;

/**
 * One verification step on the white registration layout: enter the email / number → "Enter the
 * code we sent" (boxes with paste, auto-advance and auto-submit; WebOTP on Android; the iOS
 * one-time-code suggestion), Resend with a cooldown, Change. Then on to the next checkout step.
 */
export function ChannelStep({ channel }: { channel: Channel }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const ctx = readCheckout(params);
  const stage = params.get("stage") === "code" ? "code" : "entry";
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { setUser } = useAuth();
  const status = useVerifyStatus();
  const copy = COPY[channel];

  const [value, setValue] = useState("");
  const [country, setCountry] = useState("255");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [checking, setChecking] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<CodeInputHandle>(null);
  const leaving = useRef(false);

  const goNext = async () => {
    leaving.current = true;
    if (ctx.fromAccount || !ctx.plan) {
      router.push(ctx.fromAccount ? "/account/security" : ctx.next);
      return;
    }
    const checkout = await queryClient.fetchQuery({
      queryKey: ["checkout", ctx.plan, ctx.trial],
      queryFn: () =>
        unwrap(
          api.GET("/api/v1/billing/checkout", {
            params: { query: { plan: ctx.plan!, trial: ctx.trial || undefined } },
          }),
        ),
      staleTime: 0,
    });
    router.push(stepHref(checkout.steps[0] ?? "payment", ctx));
  };

  // Prefill a claimed-but-unverified value; restore a pending code after a reload; skip a step
  // that's already done (unless the member came to change it from Account).
  useEffect(() => {
    const contact = status.data?.[channel];
    if (!contact || leaving.current) return;
    if (contact.verified && !ctx.fromAccount) {
      void goNext();
      return;
    }
    if (!value && contact.value && !contact.verified)
      setValue(channel === "phone" ? localPhone(contact.value) : contact.value);
    if (!sent && contact.pending) {
      setSent(contact.pending);
      setResendAt(Date.now() + contact.pending.resend_in * 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data]);

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resendAt]);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const showCode = stage === "code" && !!sent;
  useWebOtp(showCode && channel === "phone", (otp) => codeRef.current?.fill(otp));

  const send = async () => {
    if (sending) return;
    if (!value.trim()) {
      setError(channel === "email" ? "Enter your email address." : "Enter your mobile number.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const result = await unwrap(
        api.POST("/api/v1/auth/verify/{channel}/start", {
          params: { path: { channel } },
          body: { value: channel === "phone" ? phoneForApi(value, country) : value.trim() },
        }),
      );
      setSent(result);
      setResendAt(Date.now() + result.resend_in * 1000);
      setNow(Date.now());
      setCode("");
      setCodeError("");
      if (stage === "code") toast({ message: `We sent a new code to ${result.sent_to}.` });
      else router.push(`${pathname}${checkoutQuery(ctx, { stage: "code" })}`);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.code === "resend_cooldown") {
        const wait = Number(err.body.retry_in ?? 30);
        setResendAt(Date.now() + wait * 1000);
        setNow(Date.now());
      }
      const message =
        err?.fields.value ?? err?.message ?? "Something went wrong. Please try again.";
      if (stage === "code") toast({ message, tone: "error" });
      else setError(message);
    } finally {
      setSending(false);
    }
  };

  const verify = async (digits: string) => {
    if (checking || leaving.current) return;
    setChecking(true);
    setCodeError("");
    try {
      const result = await unwrap(
        api.POST("/api/v1/auth/verify/{channel}/confirm", {
          params: { path: { channel } },
          body: { code: digits },
        }),
      );
      setUser(result.user);
      toast({ message: copy.done, tone: "success" }, 2500);
      void queryClient.invalidateQueries({ queryKey: ["verify-status"] });
      await goNext();
    } catch (e) {
      setCode("");
      setCodeError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setChecking(false);
    }
  };

  const step = ctx.fromAccount ? undefined : STEP_NUMBER[channel];
  const network = channel === "phone" && sent ? networkOf(sent.target) : null;

  return (
    <RegistrationShell>
      {status.isPending ? (
        <div className="grid flex-1 place-items-center" aria-busy>
          <Spinner className="size-8 text-[#e50914]" label="Loading" />
        </div>
      ) : showCode && sent ? (
        <form
          noValidate
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === sent.length) void verify(code);
          }}
        >
          <StepHeading step={step} of={3} title="Enter the code we sent">
            We sent a {sent.length}-digit code to <b data-testid="sent-to">{sent.sent_to}</b>.
            {channel === "phone"
              ? " It may take a minute to arrive."
              : " Check your spam folder if you don't see it."}
          </StepHeading>
          {network ? <NetworkChip network={network} className="mb-5 self-start" /> : null}
          <CodeInput
            ref={codeRef}
            length={sent.length}
            value={code}
            onChange={(v) => {
              setCode(v);
              if (codeError) setCodeError("");
            }}
            onComplete={(v) => void verify(v)}
            label={`Verification code sent to ${sent.sent_to}`}
            error={codeError}
            disabled={checking}
          />
          <p
            className="text-meta mt-3 flex min-h-5 items-center gap-2 text-[#595959]"
            aria-live="polite"
          >
            {checking ? (
              <>
                <Spinner className="size-4" /> Checking your code…
              </>
            ) : null}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost-light"
              size="sm"
              loading={sending}
              disabled={resendIn > 0 || checking}
              onClick={() => void send()}
              className="text-body h-auto !px-0 py-1"
            >
              {resendIn > 0 ? `Resend code in ${formatShortCountdown(resendIn)}` : "Resend code"}
            </Button>
            <button
              type="button"
              disabled={checking}
              onClick={() => router.push(`${pathname}${checkoutQuery(ctx)}`)}
              className="text-body rounded font-semibold text-[#333] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#0071eb] disabled:opacity-50"
            >
              {copy.change}
            </button>
          </div>
          <StepActions>
            <Button
              type="submit"
              variant="accent-light"
              size="lg"
              fullWidth
              loading={checking}
              disabled={code.length < sent.length}
              className="text-h3 h-14 font-medium"
            >
              Verify
            </Button>
          </StepActions>
        </form>
      ) : (
        <form
          noValidate
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <StepHeading step={step} of={3} title={copy.title}>
            {copy.help}
          </StepHeading>
          {channel === "email" ? (
            <LightField
              label="Email address"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              enterKeyHint="send"
              autoFocus
              value={value}
              error={error}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
            />
          ) : (
            <PhoneField
              country={country}
              onCountryChange={setCountry}
              value={value}
              onChange={(v) => {
                setValue(v);
                setError("");
              }}
              error={error}
              autoFocus
            />
          )}
          <StepActions>
            <Button
              type="submit"
              variant="accent-light"
              size="lg"
              fullWidth
              loading={sending}
              className="text-h3 h-14 font-medium"
            >
              Send code
            </Button>
          </StepActions>
          {!ctx.fromAccount && ctx.plan ? (
            <button
              type="button"
              onClick={() =>
                router.push(`/signup/plan?plan=${ctx.plan}&next=${encodeURIComponent(ctx.next)}`)
              }
              className="text-body mt-4 self-start rounded text-[#333] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#0071eb]"
            >
              Back to plans
            </button>
          ) : null}
        </form>
      )}
    </RegistrationShell>
  );
}
