"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";

/** Submits only on the button or Enter (never on its own). */
export function LoginForm() {
  const config = useConfig();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const minLength = config.num("auth.password_min_length", 8);
  const usernameOk = /^[A-Za-z0-9_]{3,30}$/.test(username.trim());

  const submit = async () => {
    if (submitting) return;
    if (!usernameOk) return setError("Enter your username (3–30 letters, numbers or underscores).");
    if (password.length < minLength)
      return setError(`Your password has at least ${minLength} characters.`);
    setSubmitting(true);
    setError("");
    try {
      signIn(
        await unwrap(
          api.POST("/api/v1/auth/login", {
            body: { username: username.trim(), password, app: "client" },
          }),
        ),
      );
      router.replace(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle={config.str("branding.tagline")}
      footer={
        <>
          New to {config.str("branding.site_name", "NETFLY")}?{" "}
          <Link href="/signup" className="font-semibold text-white hover:underline">
            Sign up now
          </Link>
          .
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
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
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          error={error}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
        />
        <Button
          type="submit"
          variant="accent"
          size="lg"
          fullWidth
          loading={submitting}
          className="mt-2"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
