"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn, passwordStrength } from "@netfly/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RegistrationShell, StepActions, StepHeading } from "@/components/auth/registration-shell";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
import { LightField } from "@/components/ui/light-field";
import { goAfterAuth } from "@/lib/after-auth";
import { api } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";
import { clearSignupDraft, useSignupDraft } from "../draft";

const BAR = ["bg-[#e50914]", "bg-[#e87c03]", "bg-[#d9a400]", "bg-[#5aa02c]", "bg-[#2f9e44]"];

export default function SignupPasswordStep() {
  const router = useRouter();
  const config = useConfig();
  const draft = useSignupDraft();
  const { signIn } = useAuth();
  const min = config.num("auth.password_min_length", 8);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(draft.errors.password ?? "");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const strength = passwordStrength(password);

  useEffect(() => {
    if (!draft.ready) return;
    if (!draft.name) router.replace(draft.href("/signup/name"));
    else if (!draft.username) router.replace(draft.href("/signup/username"));
  }, [draft, router]);

  const submit = async () => {
    if (submitting) return;
    if (password.length < min) return setError(`Use at least ${min} characters.`);
    setSubmitting(true);
    setFormError("");
    try {
      const session = await unwrap(
        api.POST("/api/v1/auth/signup", {
          body: { username: draft.username, full_name: draft.name, password, app: "client" },
        }),
      );
      signIn(session);
      clearSignupDraft();
      // Every new member picks a plan next (Free is preselected); `next` rides along.
      goAfterAuth(`/signup/plan?next=${encodeURIComponent(safeNext(draft.next))}`);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      const fields = err?.fields ?? {};
      setSubmitting(false);
      // Errors go back to the step that owns the field.
      if (fields.full_name) {
        draft.set({ errors: { name: fields.full_name } });
        router.push(draft.href("/signup/name"));
      } else if (fields.username) {
        draft.set({ errors: { username: fields.username } });
        router.push(draft.href("/signup/username"));
      } else if (fields.password) {
        setError(fields.password);
      } else {
        setFormError(err?.message ?? "Something went wrong. Please try again.");
      }
    }
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
          void submit();
        }}
      >
        <StepHeading step={3} of={3} title="Create a password">
          At least {min} characters. A longer phrase is stronger and easier to remember.
        </StepHeading>
        {/* Lets password managers save the pair. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={draft.username}
          readOnly
          hidden
        />
        <LightField
          label="Password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          enterKeyHint="done"
          autoFocus
          value={password}
          error={error}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          trailing={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-pressed={show}
              aria-label={show ? "Hide password" : "Show password"}
              className="text-meta mr-1 self-center rounded px-3 py-2 font-bold tracking-wide text-[#595959] uppercase hover:text-[#333] focus-visible:outline-2 focus-visible:outline-[#0071eb]"
            >
              {show ? "Hide" : "Show"}
            </button>
          }
        />
        <div
          className={cn("mt-3 flex items-center gap-3", password ? "opacity-100" : "opacity-0")}
          aria-hidden={!password}
        >
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e6e6e6]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    BAR[strength.score],
                  )}
                  style={{
                    width:
                      strength.score > i ? "100%" : strength.score === i && password ? "35%" : "0%",
                  }}
                />
              </div>
            ))}
          </div>
          <span className="text-meta w-24 text-right text-[#595959]">{strength.label}</span>
        </div>
        <p className="sr-only" aria-live="polite">
          {password ? `Password strength: ${strength.label}` : ""}
        </p>
        {formError && (
          <p role="alert" className="text-body mt-5 rounded bg-[#e87c03] px-4 py-3 text-white">
            {formError}
          </p>
        )}
        <StepActions>
          <Button
            type="submit"
            variant="accent-light"
            size="lg"
            fullWidth
            loading={submitting}
            className="text-h3 h-14 font-medium"
          >
            Finish
          </Button>
        </StepActions>
        <button
          type="button"
          onClick={() => router.push(draft.href("/signup/username"))}
          className="text-body mt-4 self-start rounded text-[#333] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#0071eb]"
        >
          Back
        </button>
      </form>
    </RegistrationShell>
  );
}
