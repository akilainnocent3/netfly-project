"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { useAutoSubmit } from "@netfly/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitRow } from "@/components/auth/submit-row";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";

export function LoginForm() {
  const config = useConfig();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Every account's password is at least the configured minimum, so shorter
  // input can never be right — don't spend a login attempt on it.
  const minLength = config.num("auth.password_min_length", 8);
  const isValid = /^[A-Za-z0-9_]{3,30}$/.test(username.trim()) && password.length >= minLength;

  const { status, submitNow } = useAutoSubmit({
    values: { username: username.trim(), password },
    isValid,
    delay: config.num("ux.autosubmit_delay_ms", 600),
    onSubmit: async (values) => {
      setError("");
      try {
        const session = await unwrap(
          api.POST("/api/v1/auth/login", { body: { ...values, app: "client" } }),
        );
        signIn(session);
        router.replace(next);
        return true;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
        return false;
      }
    },
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle={config.str("branding.tagline")}
      busy={status === "submitting"}
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-fg font-semibold hover:underline">
            Create an account
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
        <SubmitRow status={status} ready={isValid} label="Sign in" />
      </form>
    </AuthShell>
  );
}
