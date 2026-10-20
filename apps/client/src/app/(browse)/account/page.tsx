"use client";

import { ApiError, unwrap, type User } from "@netfly/api-client";
import { cn, passwordStrength } from "@netfly/ui";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/browse/title-grid";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { SwitchRow } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

type Prefs = Pick<
  User,
  "full_name" | "preferred_quality" | "autoplay_next" | "autoplay_previews" | "subtitles_language"
>;
type PrefKey = keyof Prefs;

const QUALITIES = [
  { value: "auto", label: "Auto — highest quality" },
  { value: "2160", label: "4K (2160p)" },
  { value: "1080", label: "Full HD (1080p)" },
  { value: "720", label: "HD (720p)" },
  { value: "480", label: "480p" },
  { value: "data_saver", label: "Data saver" },
];

const SELECT =
  "text-body h-12 w-full rounded-[4px] border border-[rgb(128_128_128/0.7)] bg-[rgb(22_22_22/0.7)] px-3 outline-none focus:border-white focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60";

export default function AccountPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState<PrefKey | null>(null);

  /** One preference at a time; the control being saved is disabled and shows a spinner. */
  const save = async (key: PrefKey, patch: Partial<Prefs>) => {
    if (saving) return;
    setSaving(key);
    try {
      setUser(await unwrap(api.PATCH("/api/v1/auth/me", { body: patch })));
      toast({ message: "Saved", tone: "success" }, 1800);
    } catch (e) {
      toast({
        message: e instanceof ApiError ? e.message : "Couldn't save",
        tone: "error",
        action: { label: "Retry", onClick: () => void save(key, patch) },
      });
    } finally {
      setSaving(null);
    }
  };

  if (!user)
    return (
      <PageShell title="Account">
        <Skeleton className="h-64 max-w-2xl rounded-xl" />
      </PageShell>
    );

  return (
    <PageShell title="Account" subtitle={`@${user.username}`}>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          <NameField
            user={user}
            saving={saving === "full_name"}
            onSave={(full_name) => void save("full_name", { full_name })}
          />
        </Panel>
        <Panel title="Password">
          <PasswordForm />
        </Panel>
        <Panel title="Playback" className="lg:col-span-2">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-body mb-2 flex items-center gap-2 font-semibold">
                Default quality{" "}
                {saving === "preferred_quality" && (
                  <Spinner className="text-muted" label="Saving" />
                )}
              </span>
              <select
                value={user.preferred_quality || "auto"}
                disabled={saving === "preferred_quality"}
                onChange={(e) =>
                  void save("preferred_quality", { preferred_quality: e.target.value })
                }
                className={SELECT}
              >
                {QUALITIES.map((q) => (
                  <option key={q.value} value={q.value} className="bg-surface">
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-body mb-2 flex items-center gap-2 font-semibold">
                Subtitles by default{" "}
                {saving === "subtitles_language" && (
                  <Spinner className="text-muted" label="Saving" />
                )}
              </span>
              <select
                value={user.subtitles_language || ""}
                disabled={saving === "subtitles_language"}
                onChange={(e) =>
                  void save("subtitles_language", { subtitles_language: e.target.value })
                }
                className={SELECT}
              >
                <option value="" className="bg-surface">
                  Off
                </option>
                <option value="en" className="bg-surface">
                  English
                </option>
                <option value="sw" className="bg-surface">
                  Swahili
                </option>
                <option value="fr" className="bg-surface">
                  French
                </option>
              </select>
            </label>
            <SwitchRow
              label="Autoplay next episode"
              description="Start the next episode automatically after a countdown."
              checked={user.autoplay_next ?? true}
              saving={saving === "autoplay_next"}
              disabled={saving !== null}
              onChange={(v) => void save("autoplay_next", { autoplay_next: v })}
            />
            <SwitchRow
              label="Autoplay previews"
              description="Play muted previews while you browse."
              checked={user.autoplay_previews ?? true}
              saving={saving === "autoplay_previews"}
              disabled={saving !== null}
              onChange={(v) => void save("autoplay_previews", { autoplay_previews: v })}
            />
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-surface rounded-md p-6 ring-1 ring-white/6", className)}>
      <h2 className="text-h3 mb-5 font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Saves on blur (and Enter) with a "Saved" toast; disabled while saving. */
function NameField({
  user,
  saving,
  onSave,
}: {
  user: User;
  saving: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(user.full_name);
  useEffect(() => setName(user.full_name), [user.full_name]);
  const commit = () => {
    if (name.trim() && name.trim() !== user.full_name) onSave(name.trim());
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <Field
        label="Full name"
        name="name"
        autoComplete="name"
        value={name}
        disabled={saving}
        indicator={saving ? "checking" : "none"}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
      />
    </form>
  );
}

/**
 * Explicit submit only (button or Enter) — it signs out every other device, so it must never
 * fire on its own. The new password is entered twice.
 */
function PasswordForm() {
  const config = useConfig();
  const { signIn } = useAuth();
  const toast = useToast();
  const min = config.num("auth.password_min_length", 8);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const strength = passwordStrength(next);

  const submit = async () => {
    if (submitting) return;
    const problems: Record<string, string> = {};
    if (!current) problems.current_password = "Enter your current password.";
    if (next.length < min) problems.new_password = `Use at least ${min} characters.`;
    else if (next === current) problems.new_password = "Choose a password you haven't used here.";
    if (!problems.new_password && again !== next) problems.confirm = "The passwords don't match.";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSubmitting(true);
    try {
      signIn(
        await unwrap(
          api.POST("/api/v1/auth/me/password", {
            body: { current_password: current, new_password: next },
          }),
        ),
      );
      setCurrent("");
      setNext("");
      setAgain("");
      toast({ message: "Password changed. Other devices were signed out.", tone: "success" });
    } catch (e) {
      setErrors(
        e instanceof ApiError
          ? Object.keys(e.fields).length
            ? e.fields
            : { new_password: e.message }
          : { new_password: "Couldn't change the password." },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      noValidate
      className="space-y-3"
      data-testid="password-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input type="text" name="username" autoComplete="username" hidden readOnly />
      <Field
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        error={errors.current_password}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        value={next}
        error={errors.new_password}
        hint={
          next
            ? `${strength.label}${next.length < min ? ` · at least ${min} characters` : ""}`
            : undefined
        }
        onChange={(e) => setNext(e.target.value)}
      />
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={again}
        error={errors.confirm}
        onChange={(e) => setAgain(e.target.value)}
      />
      <div className="flex justify-end pt-1">
        <Button type="submit" variant="accent" loading={submitting}>
          {submitting ? "Changing password…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
