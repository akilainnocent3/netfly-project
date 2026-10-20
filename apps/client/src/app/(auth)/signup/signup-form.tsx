"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn, passwordStrength, useAutoSubmit } from "@netfly/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitRow } from "@/components/auth/submit-row";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Field, type FieldIndicator } from "@/components/ui/field";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
const STRENGTH_COLORS = [
  "bg-red-500",
  "bg-orange-400",
  "bg-yellow-400",
  "bg-lime-400",
  "bg-emerald-400",
];

function localUsernameError(value: string): string {
  if (!value) return "";
  if (value.length < 3) return "";
  if (value.length > 30) return "Usernames can be at most 30 characters.";
  if (!USERNAME_RE.test(value)) return "Use only letters, numbers and underscores.";
  return "";
}

export function SignupForm() {
  const config = useConfig();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { signIn } = useAuth();
  const minLength = config.num("auth.password_min_length", 8);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [availability, setAvailability] = useState<{
    name: string;
    ok: boolean;
    message: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const trimmed = username.trim();
  const formatError = localUsernameError(trimmed);

  useEffect(() => {
    if (!USERNAME_RE.test(trimmed)) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        const { data } = await api
          .GET("/api/v1/auth/username-available", {
            params: { query: { username: trimmed } },
            signal: controller.signal,
          })
          .catch(() => ({ data: undefined }));
        if (data)
          setAvailability({ name: data.username, ok: data.available, message: data.message });
        setChecking(false);
      },
      config.num("ux.username_check_debounce_ms", 400),
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, config]);

  const known = availability?.name.toLowerCase() === trimmed.toLowerCase() ? availability : null;
  const usernameOk = USERNAME_RE.test(trimmed) && known?.ok === true;
  const usernameError =
    serverErrors.username || formatError || (known && !known.ok ? known.message : "");
  const indicator: FieldIndicator =
    !trimmed || trimmed.length < 3
      ? "none"
      : checking
        ? "checking"
        : usernameOk
          ? "ok"
          : usernameError
            ? "bad"
            : "none";
  const strength = passwordStrength(password);
  const isValid = usernameOk && fullName.trim().length > 0 && password.length >= minLength;

  const { status, submitNow } = useAutoSubmit({
    values: { username: trimmed, fullName: fullName.trim(), password },
    isValid,
    delay: config.num("ux.autosubmit_delay_ms", 600),
    onSubmit: async (values) => {
      setServerErrors({});
      try {
        const session = await unwrap(
          api.POST("/api/v1/auth/signup", {
            body: {
              username: values.username,
              full_name: values.fullName,
              password: values.password,
              app: "client",
            },
          }),
        );
        signIn(session);
        router.replace(next);
        return true;
      } catch (error) {
        const e = error instanceof ApiError ? error : new ApiError(0, undefined);
        setServerErrors(Object.keys(e.fields).length ? e.fields : { form: e.message });
        return false;
      }
    },
  });

  return (
    <AuthShell
      title={config.str("branding.signup_headline", "Unlimited movies and series.")}
      subtitle={config.str("branding.signup_subtext")}
      busy={status === "submitting"}
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={`/login${next !== "/browse" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-fg font-semibold hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submitNow();
        }}
        className="space-y-3"
      >
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          maxLength={30}
          value={username}
          indicator={indicator}
          error={usernameError}
          hint={
            usernameOk ? (
              <span className="text-emerald-300/90">Nice — it’s yours if you want it.</span>
            ) : undefined
          }
          onChange={(e) => {
            setUsername(e.target.value.replace(/\s/g, ""));
            setServerErrors((s) => ({ ...s, username: "" }));
          }}
        />
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          value={fullName}
          error={serverErrors.full_name}
          onChange={(e) => setFullName(e.target.value)}
        />
        <div>
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            error={serverErrors.password}
            hint={
              password && password.length < minLength
                ? `At least ${minLength} characters`
                : undefined
            }
            onChange={(e) => setPassword(e.target.value)}
          />
          <div
            className={cn(
              "mt-2 flex items-center gap-3 px-1 transition-opacity",
              password ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={!password}
          >
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      STRENGTH_COLORS[strength.score],
                    )}
                    style={{
                      width:
                        strength.score > i
                          ? "100%"
                          : strength.score === i && password
                            ? "35%"
                            : "0%",
                    }}
                  />
                </div>
              ))}
            </div>
            <span className="text-muted w-20 text-right text-xs">{strength.label}</span>
          </div>
        </div>
        {serverErrors.form && (
          <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {serverErrors.form}
          </p>
        )}
        <SubmitRow status={status} ready={isValid} label="Create account" />
      </form>
    </AuthShell>
  );
}
