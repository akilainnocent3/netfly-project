"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RegistrationShell, StepActions, StepHeading } from "@/components/auth/registration-shell";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
import type { FieldIndicator } from "@/components/ui/field";
import { LightField } from "@/components/ui/light-field";
import { api } from "@/lib/api";
import { useSignupDraft } from "../draft";

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

function formatError(value: string): string {
  if (!value || value.length < 3) return "";
  if (value.length > 30) return "Usernames can be at most 30 characters.";
  if (!USERNAME_RE.test(value)) return "Use only letters, numbers and underscores.";
  return "";
}

export default function SignupUsernameStep() {
  const router = useRouter();
  const config = useConfig();
  const draft = useSignupDraft();
  const [username, setUsername] = useState(draft.username);
  const [serverError, setServerError] = useState(draft.errors.username ?? "");
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{
    name: string;
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!draft.ready) return;
    if (!draft.name) router.replace(draft.href("/signup/name"));
    else setUsername((u) => u || draft.username);
  }, [draft, router]);

  const trimmed = username.trim();
  // Live availability check (debounced). Typing never submits anything.
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
        if (!controller.signal.aborted) setChecking(false);
      },
      config.num("ux.username_check_debounce_ms", 400),
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, config]);

  const known = availability?.name.toLowerCase() === trimmed.toLowerCase() ? availability : null;
  const ok = USERNAME_RE.test(trimmed) && known?.ok === true && !checking;
  const error =
    serverError || formatError(trimmed) || (known && !known.ok && !checking ? known.message : "");
  const indicator: FieldIndicator =
    trimmed.length < 3 ? "none" : checking ? "checking" : ok ? "ok" : error ? "bad" : "none";

  const submit = () => {
    if (!ok) return;
    draft.set({ username: trimmed, errors: { ...draft.errors, username: undefined } });
    router.push(draft.href("/signup/password"));
  };

  return (
    <RegistrationShell
      signInHref={draft.next ? `/login?next=${encodeURIComponent(draft.next)}` : "/login"}
    >
      <form
        noValidate
        className="flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <StepHeading step={2} of={3} title="Create your username">
          You&apos;ll use it to sign in. Letters, numbers and underscores.
        </StepHeading>
        <LightField
          label="Username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          autoFocus
          maxLength={30}
          value={username}
          indicator={indicator}
          error={error}
          hint={
            ok ? (
              <span className="text-[#2f7a39]">Nice — it’s yours if you want it.</span>
            ) : undefined
          }
          onChange={(e) => {
            setUsername(e.target.value.replace(/\s/g, ""));
            setServerError("");
          }}
        />
        <p className="sr-only" aria-live="polite">
          {checking ? "Checking availability" : ok ? "Username available" : ""}
        </p>
        <StepActions>
          <Button
            type="submit"
            variant="accent-light"
            size="lg"
            fullWidth
            disabled={!ok}
            className="text-h3 h-14 font-medium"
          >
            Next
          </Button>
        </StepActions>
        <button
          type="button"
          onClick={() => router.push(draft.href("/signup/name"))}
          className="text-body mt-4 self-start rounded text-[#333] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#0071eb]"
        >
          Back
        </button>
      </form>
    </RegistrationShell>
  );
}
