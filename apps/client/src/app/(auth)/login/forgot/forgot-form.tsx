"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CodeInput } from "@/components/verify/code-input";
import { goAfterAuth } from "@/lib/after-auth";
import { api } from "@/lib/api";
import { formatShortCountdown } from "@/lib/usage-format";
import { setFlash } from "@/lib/flash";
import { safeNext } from "@/lib/safe-next";

const RESEND_SECONDS = 60;

/**
 * Forgot password: a code goes to the account's verified phone (or email); the code plus a new
 * password signs the member back in and signs every other device out. The first answer is the
 * same whether or not an account matched, so nobody can probe who has an account.
 */
export function ForgotForm() {
  const config = useConfig();
  const next = safeNext(useSearchParams().get("next"));
  const { signIn } = useAuth();
  const minLength = config.num("auth.password_min_length", 8);
  const length = Math.max(config.num("sms.otp_length", 6), config.num("email.code_length", 6));
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; code?: string; password?: string }>(
    {},
  );
  const [busy, setBusy] = useState<"send" | "reset" | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resendAt]);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const send = async () => {
    if (busy) return;
    if (!identifier.trim()) {
      setErrors({ identifier: "Enter your email, phone number or username." });
      return;
    }
    setBusy("send");
    setErrors({});
    try {
      const res = await unwrap(
        api.POST("/api/v1/auth/password-reset/start", {
          body: { identifier: identifier.trim() },
        }),
      );
      setToken(res.reset_token);
      setCode("");
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
    } catch (e) {
      setErrors({
        identifier: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (busy || !token) return;
    const problems: typeof errors = {};
    if (code.length < 4) problems.code = "Enter the code we sent you.";
    if (password.length < minLength) problems.password = `Use at least ${minLength} characters.`;
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy("reset");
    try {
      signIn(
        await unwrap(
          api.POST("/api/v1/auth/password-reset/confirm", {
            body: { reset_token: token, code, new_password: password, app: "client" },
          }),
        ),
      );
      setFlash("Your password has been changed. Other devices were signed out.");
      goAfterAuth(next);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.fields.new_password) setErrors({ password: err.fields.new_password });
      else {
        setCode("");
        setErrors({ code: err?.message ?? "Something went wrong. Please try again." });
      }
      setBusy(null);
    }
  };

  return (
    <AuthShell
      title={token ? "Check your messages" : "Reset your password"}
      subtitle={
        token
          ? "If that account has a verified phone number or email, we've sent it a code. Enter it with a new password."
          : "We'll send a code to the verified phone number or email on your account."
      }
      footer={
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="text-white hover:underline"
        >
          Back to Sign In
        </Link>
      }
    >
      {!token ? (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Field
            label="Email, phone or username"
            name="identifier"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            maxLength={254}
            value={identifier}
            error={errors.identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setErrors({});
            }}
          />
          <Button
            type="submit"
            variant="accent"
            size="lg"
            fullWidth
            loading={busy === "send"}
            className="h-12 rounded"
          >
            Send code
          </Button>
        </form>
      ) : (
        <form
          noValidate
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void reset();
          }}
        >
          <CodeInput
            tone="dark"
            length={length}
            value={code}
            onChange={(v) => {
              setCode(v);
              setErrors((s) => ({ ...s, code: undefined }));
            }}
            // Nothing to submit yet: the new password comes next.
            onComplete={() => passwordRef.current?.focus()}
            label="Reset code"
            error={errors.code}
            disabled={busy === "reset"}
          />
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={identifier}
            readOnly
            hidden
          />
          <Field
            ref={passwordRef}
            label="New password"
            name="new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            error={errors.password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((s) => ({ ...s, password: undefined }));
            }}
            trailing={
              password ? (
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-pressed={show}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="text-meta text-muted mr-1 self-center rounded px-3 py-2 font-semibold tracking-wide uppercase hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                >
                  {show ? "Hide" : "Show"}
                </button>
              ) : null
            }
          />
          <Button
            type="submit"
            variant="accent"
            size="lg"
            fullWidth
            loading={busy === "reset"}
            className="h-12 rounded"
          >
            Reset password
          </Button>
          <div className="text-body flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              loading={busy === "send"}
              disabled={resendIn > 0 || busy === "reset"}
              onClick={() => void send()}
              className="!px-0 hover:bg-transparent hover:underline"
            >
              {resendIn > 0 ? `Resend code in ${formatShortCountdown(resendIn)}` : "Resend code"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setToken(null);
                setCode("");
                setPassword("");
                setErrors({});
              }}
              className="text-muted rounded hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-white"
            >
              Start over
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
