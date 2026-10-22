"use client";

import { ApiError, unwrap, type Schemas } from "@netfly/api-client";
import { cn, LazyLogoLoader } from "@netfly/ui";
import * as Popover from "@radix-ui/react-popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, History, KeyRound, PlugZap, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/providers/toast";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Switch,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";

type Entry = Schemas["ConfigEntry"];
type Group = Schemas["ConfigGroup"];

export default function SettingsPage() {
  const groups = useQuery({
    queryKey: ["config"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/config")),
  });
  const [active, setActive] = useState("branding");
  const list = useMemo(
    () => [
      ...(groups.data ?? []),
      {
        key: "legal",
        name: "Legal pages",
        description: "Terms of Service and Privacy Policy shown to viewers.",
        entries: [],
      } as Group,
    ],
    [groups.data],
  );
  const group = list.find((g) => g.key === active);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Every value here lives in the database and takes effect within a second — no redeploy."
      />
      <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-16 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {groups.isPending
              ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-40" />)
              : list.map((g) => (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => setActive(g.key)}
                      aria-current={g.key === active ? "page" : undefined}
                      className={cn(
                        "h-8 w-full rounded-md px-2.5 text-left text-[13px] whitespace-nowrap",
                        g.key === active
                          ? "bg-hover font-medium"
                          : "text-muted hover:bg-hover hover:text-fg",
                      )}
                    >
                      {g.name}
                    </button>
                  </li>
                ))}
          </ul>
        </nav>
        <div>
          {group?.key === "legal" ? (
            <LegalPages />
          ) : group ? (
            <Card>
              <div className="border-line border-b px-5 py-4">
                <p className="font-semibold">{group.name}</p>
                <p className="text-muted text-[12.5px]">{group.description}</p>
              </div>
              {group.key === "storage" ? (
                <StorageForm entries={group.entries} />
              ) : group.key in TOOLS ? (
                <>
                  {TOOLS[group.key]!()}
                  <ul className="divide-line border-line divide-y border-t">
                    {group.entries.map((e) => (
                      <EntryRow key={e.key} entry={e} />
                    ))}
                  </ul>
                </>
              ) : (
                <ul className="divide-line divide-y">
                  {group.entries.map((e) => (
                    <EntryRow key={e.key} entry={e} />
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <Skeleton className="h-96" />
          )}
        </div>
      </div>
    </>
  );
}

function useSaveEntry() {
  const toast = useToast();
  const queryClient = useQueryClient();
  return async (key: string, value: unknown): Promise<string | null> => {
    try {
      const updated = await unwrap(
        api.PATCH("/api/v1/admin/config/{key}", { params: { path: { key } }, body: { value } }),
      );
      queryClient.setQueryData<Group[]>(["config"], (groups) =>
        groups?.map((g) => ({
          ...g,
          entries: g.entries.map((e) => (e.key === key ? updated : e)),
        })),
      );
      void queryClient.invalidateQueries({ queryKey: ["history", key] });
      toast("Saved ✓");
      return null;
    } catch (e) {
      return e instanceof ApiError ? (e.fields.value ?? e.message) : "Couldn't save";
    }
  };
}

function prettyKey(entry: Entry): string {
  if (entry.label) return entry.label;
  const last = entry.key.split(".").slice(1).join(" ").replace(/_/g, " ");
  return last.charAt(0).toUpperCase() + last.slice(1);
}

function EntryRow({ entry }: { entry: Entry }) {
  const save = useSaveEntry();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const commit = async (value: unknown): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    try {
      const failure = await save(entry.key, value);
      setError(failure);
      return failure === null;
    } finally {
      setSaving(false);
    }
  };
  return (
    <li className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:gap-6">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium">{prettyKey(entry)}</p>
          {entry.is_public && <Badge>public</Badge>}
          <HistoryButton entry={entry} />
          {saving && <LazyLogoLoader size="sm" label="Saving" className="[--nf-size:14px]" />}
        </div>
        <p className="text-muted mt-0.5 text-[12.5px]">{entry.description}</p>
        <code className="text-subtle mt-1 block text-[11px]">{entry.key}</code>
      </div>
      <div>
        <fieldset disabled={saving} aria-busy={saving}>
          <Editor entry={entry} onCommit={commit} invalid={!!error} />
        </fieldset>
        {error && (
          <p role="alert" className="mt-1.5 flex items-center gap-1 text-[12px] text-red-500">
            <CircleAlert className="size-3.5" /> {error}
          </p>
        )}
      </div>
    </li>
  );
}

function Editor({
  entry,
  onCommit,
  invalid,
}: {
  entry: Entry;
  onCommit: (v: unknown) => Promise<boolean>;
  invalid: boolean;
}) {
  const value = entry.value as unknown;
  const choices = (entry.validation as { choices?: string[] } | undefined)?.choices ?? [];
  const [draft, setDraft] = useState(() =>
    entry.value_type === "json"
      ? JSON.stringify(value, null, 2)
      : value == null
        ? ""
        : String(value),
  );
  useEffect(() => {
    setDraft(
      entry.value_type === "json"
        ? JSON.stringify(entry.value, null, 2)
        : entry.value == null
          ? ""
          : String(entry.value),
    );
  }, [entry.value, entry.value_type]);
  const blur = () => {
    const original =
      entry.value_type === "json"
        ? JSON.stringify(value, null, 2)
        : value == null
          ? ""
          : String(value);
    if (draft !== original) onCommit(draft);
  };

  switch (entry.value_type) {
    case "secret":
      return <SecretEditor entry={entry} onCommit={onCommit} />;
    case "bool":
      return (
        <Switch
          checked={value === true}
          onCheckedChange={(v) => onCommit(v)}
          label={prettyKey(entry)}
        />
      );
    case "enum":
      return (
        <Select
          value={String(value ?? "")}
          onChange={(e) => onCommit(e.target.value)}
          className="w-full max-w-xs"
        >
          {choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      );
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000"}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={blur}
            aria-label={`${prettyKey(entry)} color`}
            className="border-line bg-panel h-8 w-10 cursor-pointer rounded border p-0.5"
          />
          <div className="w-32 shrink-0">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={blur}
              onKeyDown={(e) => e.key === "Enter" && blur()}
              invalid={invalid}
              className="font-mono"
              aria-label={`${prettyKey(entry)} hex`}
            />
          </div>
          <span
            className="border-line h-8 flex-1 rounded-md border"
            style={{ background: draft }}
            aria-hidden
          />
        </div>
      );
    case "int":
    case "float":
      return (
        <div className="flex max-w-xs items-center gap-2">
          <Input
            type="number"
            step={entry.value_type === "float" ? "any" : 1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={blur}
            onKeyDown={(e) => e.key === "Enter" && blur()}
            invalid={invalid}
            className="tabular"
            aria-label={prettyKey(entry)}
          />
          {entry.unit && <span className="text-muted text-[12.5px]">{entry.unit}</span>}
        </div>
      );
    case "json":
      return (
        <JsonEditor
          entryKey={entry.key}
          draft={draft}
          setDraft={setDraft}
          onBlur={blur}
          invalid={invalid}
        />
      );
    case "text":
      return (
        <Textarea
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={blur}
          aria-label={prettyKey(entry)}
        />
      );
    default:
      return (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={blur}
          onKeyDown={(e) => e.key === "Enter" && blur()}
          invalid={invalid}
          aria-label={prettyKey(entry)}
        />
      );
  }
}

interface Rung {
  name: string;
  height: number;
  video_kbps: number;
  max_kbps?: number;
  codec: string;
}

function JsonEditor({
  entryKey,
  draft,
  setDraft,
  onBlur,
  invalid,
}: {
  entryKey: string;
  draft: string;
  setDraft: (v: string) => void;
  onBlur: () => void;
  invalid: boolean;
}) {
  let parsed: unknown = null;
  let parseError = "";
  try {
    parsed = JSON.parse(draft);
  } catch (e) {
    parseError = e instanceof Error ? e.message : "Invalid JSON";
  }
  const ladder =
    entryKey === "transcoding.ladder" && Array.isArray(parsed) ? (parsed as Rung[]) : null;
  return (
    <div>
      <Textarea
        rows={Math.min(16, draft.split("\n").length + 1)}
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => !parseError && onBlur()}
        className={cn(
          "font-mono text-[12px] leading-relaxed",
          (parseError || invalid) && "border-red-500",
        )}
        aria-label={entryKey}
      />
      {parseError ? (
        <p className="mt-1 text-[12px] text-red-500">{parseError}</p>
      ) : ladder ? (
        <table className="mt-2 w-full text-[12px]">
          <thead className="text-muted">
            <tr>
              <th className="py-1 text-left font-medium">Rung</th>
              <th className="text-left font-medium">Height</th>
              <th className="text-left font-medium">Target</th>
              <th className="text-left font-medium">Cap</th>
              <th className="text-left font-medium">Codec</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {ladder.map((r) => (
              <tr key={r.name} className="border-line border-t">
                <td className="py-1">{r.name}</td>
                <td>{r.height}p</td>
                <td>{(r.video_kbps / 1000).toFixed(1)} Mbps</td>
                <td>{r.max_kbps ? `${(r.max_kbps / 1000).toFixed(1)} Mbps` : "—"}</td>
                <td>{r.codec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="text-subtle mt-1 text-[11.5px]">
        Validated against the schema when you leave the field.
        {entryKey === "transcoding.ladder"
          ? " New uploads use the new ladder; rungs above a source's height are skipped."
          : null}
      </p>
    </div>
  );
}

function SecretEditor({
  entry,
  onCommit,
}: {
  entry: Entry;
  onCommit: (v: unknown) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted font-mono text-[13px] tracking-widest">
          {entry.has_value ? "••••••••" : "not set"}
        </span>
        <Button size="sm" onClick={() => setEditing(true)}>
          <KeyRound className="size-3.5" /> {entry.has_value ? "Replace" : "Set"}
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving || !value) return;
        setSaving(true);
        const ok = await onCommit(value);
        setSaving(false);
        if (ok) {
          setEditing(false);
          setValue("");
        }
      }}
    >
      <Input
        type="password"
        autoFocus
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New value (write-only)"
        aria-label={`New ${prettyKey(entry)}`}
      />
      <Button type="submit" size="sm" variant="primary" disabled={!value} loading={saving}>
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(false);
          setValue("");
        }}
      >
        Cancel
      </Button>
    </form>
  );
}

function HistoryButton({ entry }: { entry: Entry }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: ["history", entry.key],
    enabled: open,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/admin/config/{key}/history", { params: { path: { key: entry.key } } }),
      ),
  });
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="Change history"
        title={entry.updated_by ? `Last changed by ${entry.updated_by}` : "Change history"}
        className="text-subtle hover:bg-hover hover:text-fg grid size-6 place-items-center rounded"
      >
        <History className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="border-line bg-panel z-[150] w-80 rounded-lg border p-3 text-[12.5px] shadow-xl"
        >
          <p className="mb-2 font-medium">History</p>
          {history.isPending ? (
            <LazyLogoLoader size="sm" label="Loading history" />
          ) : history.data?.length ? (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {history.data.map((h) => {
                const change = (h.changes as Record<string, unknown>)[entry.key];
                return (
                  <li key={h.id} className="border-line border-b pb-2 last:border-0">
                    <p className="text-muted">
                      {new Date(h.created_at).toLocaleString()} · {h.actor ?? "system"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11.5px] break-all">
                      {describeChange(change)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted">No changes yet.</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function describeChange(change: unknown): string {
  if (change && typeof change === "object" && "new" in change && "old" in change) {
    return `${JSON.stringify(change.old)} → ${JSON.stringify(change.new)}`;
  }
  return String(change);
}

/** Credentials are verified with "Test connection" *before* they're saved. */
function StorageForm({ entries }: { entries: Entry[] }) {
  const toast = useToast();
  const save = useSaveEntry();
  const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
  const field = (k: string) => (byKey[`storage.s3.${k}`]?.value as string | undefined) ?? "";
  const [draft, setDraft] = useState({
    bucket: field("bucket"),
    region: field("region"),
    endpoint_url: field("endpoint_url"),
    prefix: field("prefix"),
    access_key_id: "",
    secret_access_key: "",
  });
  const [result, setResult] = useState<Schemas["StorageTestResult"] | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | "cors" | "cdn" | null>(null);
  const others = entries.filter((e) => !e.key.startsWith("storage.s3."));

  const test = async () => {
    setBusy("test");
    try {
      setResult(await unwrap(api.POST("/api/v1/admin/storage/test", { body: draft })));
    } finally {
      setBusy(null);
    }
  };
  const persist = async () => {
    setBusy("save");
    const changes = Object.entries(draft).filter(([k, v]) =>
      k.endsWith("_id") || k.endsWith("_key") ? v !== "" : v !== field(k),
    );
    for (const [k, v] of changes) {
      const error = await save(`storage.s3.${k}`, v);
      if (error) {
        toast(`${k}: ${error}`, "error");
        setBusy(null);
        return;
      }
    }
    setDraft((d) => ({ ...d, access_key_id: "", secret_access_key: "" }));
    setBusy(null);
  };
  const cors = async () => {
    setBusy("cors");
    const r = await unwrap(api.POST("/api/v1/admin/storage/apply-cors"));
    toast(r.message, r.ok ? "success" : "error");
    setBusy(null);
  };
  const cdn = async () => {
    setBusy("cdn");
    const r = await unwrap(api.POST("/api/v1/admin/cdn/test", { body: {} }));
    toast(r.message, r.ok ? "success" : "error");
    setBusy(null);
  };

  const input = (
    k: keyof typeof draft,
    label: string,
    opts: { secret?: boolean; placeholder?: string } = {},
  ) => (
    <div>
      <Label htmlFor={`s3-${k}`}>{label}</Label>
      <Input
        id={`s3-${k}`}
        type={opts.secret ? "password" : "text"}
        autoComplete="off"
        value={draft[k]}
        placeholder={
          opts.secret
            ? byKey[`storage.s3.${k}`]?.has_value
              ? "•••••••• (unchanged)"
              : "not set"
            : opts.placeholder
        }
        onChange={(e) => {
          setDraft({ ...draft, [k]: e.target.value });
          setResult(null);
        }}
      />
    </div>
  );

  return (
    <div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        {input("bucket", "Bucket")}
        {input("region", "Region", { placeholder: "eu-west-1" })}
        {input("access_key_id", "Access key id", { secret: true })}
        {input("secret_access_key", "Secret access key", { secret: true })}
        {input("prefix", "Key prefix", { placeholder: "netfly/" })}
        {input("endpoint_url", "Custom endpoint (S3-compatible)", {
          placeholder: "Leave empty for Amazon S3",
        })}
      </div>
      {result && (
        <div
          className={cn(
            "mx-5 mb-4 rounded-md border p-3 text-[12.5px]",
            result.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 font-medium",
              result.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400",
            )}
          >
            {result.ok ? <Check className="size-4" /> : <CircleAlert className="size-4" />}{" "}
            {result.message}
          </p>
          {result.steps && result.steps.length > 0 && (
            <p className="text-muted mt-1">{result.steps.join(" · ")}</p>
          )}
        </div>
      )}
      <div className="border-line flex flex-wrap gap-2 border-t px-5 py-3">
        <Button onClick={() => void test()} loading={busy === "test"}>
          <PlugZap className="size-3.5" /> Test connection
        </Button>
        <Button
          variant="primary"
          onClick={() => void persist()}
          loading={busy === "save"}
          disabled={result?.ok === false}
        >
          Save storage settings
        </Button>
        <Button onClick={() => void cors()} loading={busy === "cors"}>
          <ShieldCheck className="size-3.5" /> Apply CORS to bucket
        </Button>
        <Button variant="ghost" onClick={() => void cdn()} loading={busy === "cdn"}>
          Test CDN
        </Button>
      </div>
      <ul className="divide-line border-line divide-y border-t">
        {others.map((e) => (
          <EntryRow key={e.key} entry={e} />
        ))}
      </ul>
    </div>
  );
}

/** Upload a replacement intro clip (MP4, H.264 + AAC, ≤ 15 s, ≤ 20 MB). */
/** Extra controls shown above a group's settings. */
const TOOLS: Record<string, () => React.ReactNode> = {
  intro: () => <IntroUpload />,
  email: () => <EmailTools />,
  sms: () => <SmsTools />,
  payments: () => <PaymentTools />,
  testing: () => <TestModeTools />,
};

type ToolResult = { ok: boolean; message: string };

/** One "test" action: a button with a spinner, then the provider's answer inline. */
function useTool() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const run = async (fn: () => Promise<ToolResult>) => {
    if (pending) return;
    setPending(true);
    setResult(null);
    try {
      setResult(await fn());
    } catch (e) {
      setResult({ ok: false, message: e instanceof ApiError ? e.message : "Request failed" });
    } finally {
      setPending(false);
    }
  };
  return { pending, result, run };
}

function ToolResultLine({ result }: { result: ToolResult | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-1.5 text-[12.5px]",
        result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500",
      )}
    >
      {result.ok ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}
      {result.message}
    </p>
  );
}

function EmailTools() {
  const [to, setTo] = useState("");
  const tool = useTool();
  return (
    <form
      className="flex flex-wrap items-center gap-2 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        void tool.run(() => unwrap(api.POST("/api/v1/admin/email/test", { body: { to } })));
      }}
    >
      <p className="text-muted w-full text-[12.5px]">
        Save the SMTP settings below, then send yourself a test email.
      </p>
      <Input
        type="email"
        required
        placeholder="you@example.com"
        aria-label="Send the test email to"
        className="max-w-64"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <Button type="submit" variant="secondary" loading={tool.pending} disabled={!to}>
        <PlugZap className="size-3.5" /> Send test email
      </Button>
      <ToolResultLine result={tool.result} />
    </form>
  );
}

function SmsTools() {
  const [to, setTo] = useState("");
  const send = useTool();
  const balance = useTool();
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-muted text-[12.5px]">
        Beem Africa: save the API key, secret key and an approved sender ID below. Codes use our own
        template by default so phones can fill them in automatically (WebOTP).
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send.run(() => unwrap(api.POST("/api/v1/admin/sms/test", { body: { to } })));
        }}
      >
        <Input
          type="tel"
          required
          placeholder="0712 345 678"
          aria-label="Send the test SMS to"
          className="max-w-48"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button type="submit" variant="secondary" loading={send.pending} disabled={!to}>
          <PlugZap className="size-3.5" /> Send test SMS
        </Button>
        <Button
          type="button"
          variant="secondary"
          loading={balance.pending}
          onClick={() => void balance.run(() => unwrap(api.GET("/api/v1/admin/sms/balance")))}
        >
          Check balance
        </Button>
      </form>
      <ToolResultLine result={send.result} />
      <ToolResultLine result={balance.result} />
    </div>
  );
}

function PaymentTools() {
  const test = useTool();
  const [webhook, setWebhook] = useState<{ url: string; configured: boolean } | null>(null);
  const show = useTool();
  const toast = useToast();
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-muted text-[12.5px]">
        Snippe: save the API key and webhook secret below, give Snippe the webhook URL, then make a
        small test payment to confirm the amount multiplier.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          loading={test.pending}
          onClick={() =>
            void test.run(async () => {
              const r = await unwrap(api.POST("/api/v1/admin/payments/test"));
              return { ok: r.ok, message: r.message };
            })
          }
        >
          <PlugZap className="size-3.5" /> Test API key
        </Button>
        <Button
          variant="secondary"
          loading={show.pending}
          onClick={() =>
            void show.run(async () => {
              const r = await unwrap(api.GET("/api/v1/admin/payments/test"));
              setWebhook({ url: r.webhook_url, configured: r.configured });
              return {
                ok: r.configured,
                message: r.configured
                  ? "This is the URL Snippe should call."
                  : "Derived from this request — set “Webhook public URL” so renewals can use it.",
              };
            })
          }
        >
          Show webhook URL
        </Button>
      </div>
      <ToolResultLine result={test.result} />
      {webhook ? (
        <div className="flex items-center gap-2">
          <code className="bg-raised border-line flex-1 truncate rounded-md border px-2.5 py-1.5 font-mono text-[12.5px] select-all">
            {webhook.url}
          </code>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(webhook.url)
                .then(() => toast("Copied ✓"))
                .catch(() => toast("Couldn't copy", "error"))
            }
          >
            Copy
          </Button>
        </div>
      ) : null}
      <ToolResultLine result={show.result} />
    </div>
  );
}

/** Test mode: a warning while it's on, and the outbox of messages that weren't sent. */
function TestModeTools() {
  // Same query as the page: re-renders when the switch below is saved.
  const groups = useQuery({
    queryKey: ["config"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/config")),
  }).data;
  const on = !!groups?.flatMap((g) => g.entries).find((e) => e.key === "testing.mock_providers")
    ?.value;
  const [kind, setKind] = useState<"sms" | "email">("sms");
  const [to, setTo] = useState("");
  const outbox = useQuery({
    queryKey: ["outbox", kind, to],
    enabled: false,
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/testing/outbox", { params: { query: { kind, to } } })),
  });
  return (
    <div className="space-y-3 px-5 py-4">
      {on ? (
        <p className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-300">
          <CircleAlert className="size-4 shrink-0" /> Test mode is ON: no real SMS, email or
          mobile-money requests are made. Turn it off before going live.
        </p>
      ) : null}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void outbox.refetch();
        }}
      >
        <Select
          aria-label="Message type"
          value={kind}
          onChange={(e) => setKind(e.target.value as "sms" | "email")}
        >
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </Select>
        <Input
          aria-label="Recipient"
          placeholder={kind === "sms" ? "0712 345 678" : "viewer@example.com"}
          className="max-w-56"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button type="submit" variant="secondary" loading={outbox.isFetching} disabled={!to || !on}>
          Show outbox
        </Button>
      </form>
      {outbox.error ? (
        <ToolResultLine
          result={{
            ok: false,
            message: outbox.error instanceof ApiError ? outbox.error.message : "Request failed",
          }}
        />
      ) : null}
      {outbox.data ? (
        outbox.data.length ? (
          <ul className="space-y-2">
            {outbox.data.map((m) => (
              <li key={m.ref} className="border-line rounded-md border p-3 text-[12.5px]">
                <p className="text-subtle">{new Date(m.at * 1000).toLocaleString()}</p>
                {m.subject ? <p className="font-medium">{m.subject}</p> : null}
                <pre className="mt-1 font-sans whitespace-pre-wrap">{m.body}</pre>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-[12.5px]">Nothing sent to {to} in the last hour.</p>
        )
      ) : null}
    </div>
  );
}

function IntroUpload() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"1080" | "720" | null>(null);
  const upload = async (variant: "1080" | "720", file: File | undefined) => {
    if (!file || busy) return;
    setBusy(variant);
    try {
      await unwrap(
        api.POST("/api/v1/admin/brand/intro", {
          body: { file: file as unknown as string, variant },
          bodySerializer: (body) => {
            const form = new FormData();
            form.append("variant", body.variant);
            form.append("file", file);
            return form;
          },
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ["config"] });
      toast(`${variant}p intro replaced ✓`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <p className="text-muted mr-auto text-[12.5px]">
        Replace a clip with an MP4 (H.264 + AAC, at most 15 s and 20 MB). Clear a URL below to go
        back to the built-in NETFLY ident.
      </p>
      {(["1080", "720"] as const).map((variant) => (
        <label key={variant} className="relative">
          <input
            type="file"
            accept="video/mp4"
            className="peer sr-only"
            disabled={busy !== null}
            onChange={(e) => {
              void upload(variant, e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span
            aria-hidden
            className="border-line bg-panel hover:bg-hover peer-focus-visible:ring-accent inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium peer-focus-visible:ring-2 peer-disabled:pointer-events-none peer-disabled:opacity-50"
          >
            {busy === variant && (
              <LazyLogoLoader size="sm" decorative className="text-current [--nf-size:14px]" />
            )}
            Upload {variant}p intro
          </span>
          <span className="sr-only">Upload {variant}p intro</span>
        </label>
      ))}
    </div>
  );
}

function LegalPages() {
  const toast = useToast();
  const pages = useQuery({
    queryKey: ["legal"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/legal")),
  });
  const save = async (slug: string, body: { title?: string; body_markdown?: string }) => {
    try {
      await unwrap(api.PATCH("/api/v1/admin/legal/{slug}", { params: { path: { slug } }, body }));
      toast("Saved ✓");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save", "error");
    }
  };
  if (pages.isPending) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-4">
      {pages.data?.map((p) => (
        <Card key={p.slug} className="space-y-3 p-5">
          <Input
            defaultValue={p.title}
            onBlur={(e) =>
              e.target.value !== p.title && void save(p.slug, { title: e.target.value })
            }
            className="font-semibold"
            aria-label="Page title"
          />
          <Textarea
            rows={14}
            defaultValue={p.body_markdown}
            onBlur={(e) =>
              e.target.value !== p.body_markdown &&
              void save(p.slug, { body_markdown: e.target.value })
            }
            className="font-mono text-[12.5px]"
            aria-label={`${p.title} content`}
          />
          <p className="text-muted text-[12px]">
            Markdown (headings, lists, **bold**, links). Saves when you leave the field. Viewers see
            it at /legal/{p.slug}.
          </p>
        </Card>
      ))}
    </div>
  );
}
