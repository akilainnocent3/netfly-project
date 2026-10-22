"use client";

import { useEffect, useState } from "react";
import { RegistrationShell, StepActions, StepHeading } from "@/components/auth/registration-shell";
import { Button } from "@/components/ui/button";
import { LightField } from "@/components/ui/light-field";
import { useNavigate } from "@/lib/use-navigate";
import { useSignupDraft } from "../draft";

export default function SignupNameStep() {
  const nav = useNavigate();
  const draft = useSignupDraft();
  const [name, setName] = useState(draft.name);
  const [error, setError] = useState(draft.errors.name ?? "");
  useEffect(() => {
    if (draft.ready) setName((n) => n || draft.name);
  }, [draft.ready, draft.name]);

  const submit = () => {
    const value = name.trim().replace(/\s+/g, " ");
    if (!value) return setError("Please tell us your name.");
    if (value.length > 120) return setError("That name is too long.");
    draft.set({ name: value, errors: { ...draft.errors, name: undefined } });
    nav.push(draft.href("/signup/username"));
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
        <StepHeading step={1} of={3} title="What's your name?">
          This is how we&apos;ll greet you.
        </StepHeading>
        <LightField
          label="Full name"
          name="name"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          autoFocus
          maxLength={120}
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />
        <StepActions>
          <Button
            type="submit"
            variant="accent-light"
            size="lg"
            fullWidth
            loading={nav.pending}
            className="text-h3 h-14 font-medium"
          >
            Next
          </Button>
        </StepActions>
      </form>
    </RegistrationShell>
  );
}
