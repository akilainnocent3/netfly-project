"use client";

import { ApiError, unwrap, type User } from "@netfly/api-client";
import { cn, passwordStrength, useAutoSubmit } from "@netfly/ui";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/browse/title-grid";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";

type Prefs = Pick<
  User,
  "full_name" | "preferred_quality" | "autoplay_next" | "autoplay_previews" | "subtitles_language"
>;

const QUALITIES = [
  { value: "auto", label: "Auto — highest quality" },
  { value: "2160", label: "4K (2160p)" },
  { value: "1080", label: "Full HD (1080p)" },
  { value: "720", label: "HD (720p)" },
  { value: "480", label: "480p" },
  { value: "data_saver", label: "Data saver" },
];

export default function AccountPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const save = async (patch: Partial<Prefs>) => {
    try {
      setUser(await unwrap(api.PATCH("/api/v1/auth/me", { body: patch })));
      toast({ message: "Saved", tone: "success" }, 1800);
    } catch (e) {
      toast({ message: e instanceof ApiError ? e.message : "Couldn't save", tone: "error" });
    }
  };
  if (!user)
    return (
      <PageShell title="Account">
        <div className="skeleton h-64 max-w-2xl rounded-xl" />
      </PageShell>
    );

  return (
    <PageShell title="Account" subtitle={`@${user.username}`}>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Panel title="Profile">
          <NameField user={user} onSave={(full_name) => void save({ full_name })} />
        </Panel>
        <Panel title="Password">
          <PasswordForm />
        </Panel>
        <Panel title="Playback" className="lg:col-span-2">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[14px] font-semibold">Default quality</span>
              <select
                value={user.preferred_quality || "auto"}
                onChange={(e) => void save({ preferred_quality: e.target.value })}
                className="focus:ring-accent h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[15px] outline-none focus:ring-2"
              >
                {QUALITIES.map((q) => (
                  <option key={q.value} value={q.value} className="bg-surface">
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[14px] font-semibold">Subtitles by default</span>
              <select
                value={user.subtitles_language || ""}
                onChange={(e) => void save({ subtitles_language: e.target.value })}
                className="focus:ring-accent h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[15px] outline-none focus:ring-2"
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
            <Toggle
              label="Autoplay next episode"
              description="Start the next episode automatically after a countdown."
              checked={user.autoplay_next ?? true}
              onChange={(v) => void save({ autoplay_next: v })}
            />
            <Toggle
              label="Autoplay previews"
              description="Play muted previews while you browse."
              checked={user.autoplay_previews ?? true}
              onChange={(v) => void save({ autoplay_previews: v })}
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
    <section className={cn("bg-surface rounded-2xl p-6 ring-1 ring-white/6", className)}>
      <h2 className="mb-5 text-[18px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Saves on blur (and Enter) with a "Saved ✓" toast — no button needed. */
function NameField({ user, onSave }: { user: User; onSave: (name: string) => void }) {
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
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
      />
    </form>
  );
}

function PasswordForm() {
  const config = useConfig();
  const { signIn } = useAuth();
  const toast = useToast();
  const min = config.num("auth.password_min_length", 8);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const strength = passwordStrength(next);
  const { status, submitNow } = useAutoSubmit({
    values: { current, next },
    isValid: current.length >= min && next.length >= min && next !== current,
    delay: config.num("ux.autosubmit_delay_ms", 600) * 1.5,
    onSubmit: async (v) => {
      setErrors({});
      try {
        signIn(
          await unwrap(
            api.POST("/api/v1/auth/me/password", {
              body: { current_password: v.current, new_password: v.next },
            }),
          ),
        );
        setCurrent("");
        setNext("");
        toast({ message: "Password changed. Other devices were signed out.", tone: "success" });
        return true;
      } catch (e) {
        setErrors(
          e instanceof ApiError
            ? Object.keys(e.fields).length
              ? e.fields
              : { new_password: e.message }
            : { new_password: "Couldn't change the password." },
        );
        return false;
      }
    },
  });
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submitNow();
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
      <div className="flex items-center justify-between pt-1">
        <span className="text-muted text-[13px]" aria-live="polite">
          {status === "submitting" ? "Changing password…" : status === "done" ? "Updated" : ""}
        </span>
        <button
          type="submit"
          className="rounded-full bg-white/8 px-5 py-2 text-[14px] font-semibold text-white/80 hover:bg-white/15"
        >
          Change password
        </button>
      </div>
    </form>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-start justify-between gap-4 rounded-xl bg-white/[0.03] p-4 text-left ring-1 ring-white/8 transition hover:bg-white/[0.06]"
    >
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="text-muted mt-0.5 block text-[13px]">{description}</span>
      </span>
      <span
        className={cn(
          "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "text-accent absolute top-0.5 grid size-5 place-items-center rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        >
          {checked && <Check className="size-3" strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}
