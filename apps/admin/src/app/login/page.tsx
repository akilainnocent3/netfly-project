"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { useAutoSubmit } from "@netfly/ui";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Button, Input, Label } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";

function LoginForm() {
  const config = useConfig();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next")).replace(/^\/browse$/, "/");
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const minLength = config.num("auth.password_min_length", 8);
  const isValid = /^[A-Za-z0-9_]{3,30}$/.test(username) && password.length >= minLength;

  const { status, submitNow } = useAutoSubmit({
    values: { username, password },
    isValid,
    delay: config.num("ux.autosubmit_delay_ms", 600),
    onSubmit: async (values) => {
      setError("");
      try {
        signIn(await unwrap(api.POST("/api/v1/auth/login", { body: { ...values, app: "admin" } })));
        router.replace(next);
        return true;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Something went wrong.");
        return false;
      }
    },
  });

  const name = config.str("branding.site_name", "NETFLY");
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[360px]">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-accent text-[12px] font-black text-accent-fg">{name.slice(0, 1)}</span>
          <span className="text-[15px] font-semibold">{name} Studio</span>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-line bg-panel p-6 shadow-sm">
          {status === "submitting" && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-accent" />}
          <h1 className="text-[17px] font-semibold">Sign in to the studio</h1>
          <p className="mt-1 text-[13px] text-muted">Staff accounts only.</p>
          <form
            noValidate
            className="mt-5 space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              submitNow();
            }}
          >
            <div>
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value.trim())} />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                invalid={!!error}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
              />
              {error && <p role="alert" className="mt-1.5 text-[12.5px] text-red-500">{error}</p>}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[12px] text-subtle" aria-live="polite">
                {status === "submitting" ? "Signing in…" : status === "waiting" ? "Continuing…" : ""}
              </span>
              <Button type="submit" size="sm" variant={isValid ? "primary" : "secondary"} loading={status === "submitting"}>
                Sign in
              </Button>
            </div>
          </form>
        </div>
      </motion.div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
