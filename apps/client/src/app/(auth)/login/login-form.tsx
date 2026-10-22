"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { Check } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useGoAfterAuth } from "@/lib/after-auth";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";

/**
 * Netflix-style sign in: username, email or phone + password (SHOW), Remember me.
 * Submits only on the button or Enter — never on its own.
 */
export function LoginForm() {
  const goAfterAuth = useGoAfterAuth();
  const config = useConfig();
  const rawNext = useSearchParams().get("next");
  const next = safeNext(rawNext);
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; form?: string }>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const minLength = config.num("auth.password_min_length", 8);
  const site = config.str("branding.site_name", "NETFLY");

  const submit = async () => {
    if (submitting) return;
    const problems: typeof errors = {};
    if (!identifier.trim()) problems.identifier = "Enter your username, email or phone number.";
    if (password.length < minLength)
      problems.password = `Your password must contain at least ${minLength} characters.`;
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSubmitting(true);
    try {
      signIn(
        await unwrap(
          api.POST("/api/v1/auth/login", {
            body: { username: identifier.trim(), password, app: "client", remember },
          }),
        ),
      );
      goAfterAuth(next);
    } catch (e) {
      setErrors({
        form: e instanceof ApiError ? e.message : "Something went wrong. Please try again.",
      });
      setSubmitting(false);
    }
  };

  const signupHref = rawNext ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
  return (
    <AuthShell
      title="Sign In"
      footer={
        <>
          New to {site}?{" "}
          <Link href={signupHref} className="font-semibold text-white hover:underline">
            Sign up now
          </Link>
          .
        </>
      }
    >
      {errors.form && (
        <p role="alert" className="text-body mb-5 rounded bg-[#e87c03] px-5 py-3.5 text-white">
          {errors.form}
        </p>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <Field
          label="Email, phone or username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          maxLength={254}
          value={identifier}
          error={errors.identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setErrors((s) => ({ ...s, identifier: undefined, form: undefined }));
          }}
        />
        <Field
          label="Password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((s) => ({ ...s, password: undefined, form: undefined }));
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
          loading={submitting}
          className="mt-2 h-12 rounded"
        >
          Sign In
        </Button>
        <div className="text-body flex items-center justify-between gap-4 pt-1">
          <label className="text-muted flex cursor-pointer items-center gap-2.5 select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="grid size-[18px] place-items-center rounded-sm border border-white/70 bg-black/40 peer-checked:border-white peer-checked:bg-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
            >
              <Check className="size-3.5 text-black" strokeWidth={3.5} />
            </span>
            Remember me
          </label>
          <Link
            href={rawNext ? `/login/forgot?next=${encodeURIComponent(next)}` : "/login/forgot"}
            className="text-muted rounded hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-white"
          >
            Forgot password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
