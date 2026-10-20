"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn, passwordStrength } from "@netfly/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
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
  if (!value || value.length < 3) return "";
  if (value.length > 30) return "Usernames can be at most 30 characters.";
  if (!USERNAME_RE.test(value)) return "Use only letters, numbers and underscores.";
  return "";
}

/** Live validation + availability check while typing; submits only on the button or Enter. */
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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
  const usernameError = errors.username || formatError || (known && !known.ok ? known.message : "");
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

  const submit = async () => {
    if (submitting) return;
    const problems: Record<string, string> = {};
    if (!USERNAME_RE.test(trimmed))
      problems.username =
        formatError || "Choose a username of 3–30 letters, numbers or underscores.";
    else if (known && !known.ok) problems.username = known.message;
    if (!fullName.trim()) problems.full_name = "Please tell us your name.";
    if (password.length < minLength) problems.password = `Use at least ${minLength} characters.`;
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSubmitting(true);
    try {
      signIn(
        await unwrap(
          api.POST("/api/v1/auth/signup", {
            body: { username: trimmed, full_name: fullName.trim(), password, app: "client" },
          }),
        ),
      );
      router.replace(next);
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(0, undefined);
      setErrors(Object.keys(e.fields).length ? e.fields : { form: e.message });
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title={config.str("branding.signup_headline", "Unlimited movies and series.")}
      subtitle={config.str("branding.signup_subtext")}
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={`/login${next !== "/browse" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-semibold text-white hover:underline"
          >
            Sign in
          </Link>
          .
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
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
              <span className="text-[#46d369]">Nice — it’s yours if you want it.</span>
            ) : undefined
          }
          onChange={(e) => {
            setUsername(e.target.value.replace(/\s/g, ""));
            setErrors((s) => ({ ...s, username: "" }));
          }}
        />
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          value={fullName}
          error={errors.full_name}
          onChange={(e) => {
            setFullName(e.target.value);
            setErrors((s) => ({ ...s, full_name: "" }));
          }}
        />
        <div>
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            error={errors.password}
            hint={
              password && password.length < minLength
                ? `At least ${minLength} characters`
                : undefined
            }
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((s) => ({ ...s, password: "" }));
            }}
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
            <span className="text-caption text-muted w-20 text-right">{strength.label}</span>
          </div>
        </div>
        {errors.form && (
          <p role="alert" className="text-body rounded-md bg-[#e87c03] px-4 py-3 text-white">
            {errors.form}
          </p>
        )}
        <Button
          type="submit"
          variant="accent"
          size="lg"
          fullWidth
          loading={submitting}
          className="mt-2"
        >
          {submitting ? "Creating your account…" : "Get started"}
        </Button>
      </form>
    </AuthShell>
  );
}
