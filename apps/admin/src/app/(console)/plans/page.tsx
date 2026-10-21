"use client";

import { unwrap, type Schemas } from "@netfly/api-client";
import { cn, limitPhrase, planGradient, priceLabel } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, CreditCard, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { IconButton, useAction, useConfirm } from "@/components/ui/actions";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Switch,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";

type Plan = Schemas["AdminPlan"];
type Draft = Omit<Plan, "id" | "subscribers" | "updated_at"> & { id?: number };
type Scope = "daily" | "weekly" | "monthly";

const KEY = ["admin-plans"];
const SCOPES: Array<{ key: Scope; label: string; per: "day" | "week" | "month" }> = [
  { key: "daily", label: "Daily viewing", per: "day" },
  { key: "weekly", label: "Weekly viewing", per: "week" },
  { key: "monthly", label: "Monthly viewing", per: "month" },
];

const EMPTY: Draft = {
  slug: "",
  name: "",
  tagline: "",
  price_tzs: 0,
  period_days: 30,
  daily_limit_minutes: 60,
  weekly_limit_minutes: 240,
  monthly_limit_minutes: 720,
  trial_eligible: true,
  is_free: false,
  is_default: false,
  highlight_label: "",
  order: 0,
  feature_bullets: ["Best video quality (same on every plan)", "Every title in the catalog"],
  is_active: true,
};

const short = (minutes: number | null | undefined) =>
  minutes == null
    ? "∞"
    : minutes % 60
      ? `${Math.floor(minutes / 60)}h${minutes % 60}m`
      : `${minutes / 60}h`;

export default function PlansPage() {
  const { can } = useAuth();
  const writable = can(); // superadmin only
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Draft | null>(null);
  const plans = useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(api.GET("/api/v1/admin/plans")),
  });
  const list = plans.data ?? [];

  const reorder = useAction(
    async (ids: number[]) => {
      queryClient.setQueryData(
        KEY,
        ids.map((id) => list.find((p) => p.id === id)!),
      );
      queryClient.setQueryData(
        KEY,
        await unwrap(api.POST("/api/v1/admin/plans/reorder", { body: { ids } })),
      );
    },
    { success: "Order saved" },
  );
  const move = (index: number, by: -1 | 1) => {
    const ids = list.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    void reorder.run(ids);
  };
  const remove = (plan: Plan) =>
    confirm({
      title: `Delete ${plan.name}?`,
      body: "Only plans nobody is on can be deleted. To retire a plan with members, deactivate it instead.",
      confirmLabel: "Delete plan",
      destructive: true,
      success: "Plan deleted",
      action: async () => {
        await unwrap(api.DELETE("/api/v1/admin/plans/{id}", { params: { path: { id: plan.id } } }));
        await queryClient.invalidateQueries({ queryKey: KEY });
      },
    });

  return (
    <>
      <PageHeader
        title="Plans"
        description="Plans differ only in viewing time — every plan streams in the same top quality. Edits apply at once to everyone on the plan."
        actions={
          writable ? (
            <Button variant="primary" onClick={() => setEditing({ ...EMPTY, order: list.length })}>
              <Plus className="size-3.5" /> New plan
            </Button>
          ) : null
        }
      />
      <Card className="overflow-hidden">
        <table className="w-full text-left">
          <thead className="border-line bg-raised/50 text-muted border-b text-[12px]">
            <tr>
              <th className="w-16 px-3 py-2 font-medium">
                <span className="sr-only">Order</span>
              </th>
              <th className="px-2 py-2 font-medium">Plan</th>
              <th className="px-2 py-2 font-medium">Price</th>
              <th className="px-2 py-2 font-medium">Day · Week · Month</th>
              <th className="px-2 py-2 text-right font-medium">Members</th>
              <th className="w-24 px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className={cn("divide-line divide-y", reorder.pending && "opacity-60")}>
            {plans.isPending &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-2">
                    <Skeleton className="h-9" />
                  </td>
                </tr>
              ))}
            {list.map((plan, i) => (
              <tr key={plan.id} data-testid={`plan-row-${plan.slug}`}>
                <td className="px-3 py-2.5">
                  {writable && (
                    <div className="flex gap-0.5">
                      <IconButton
                        size="sm"
                        label={`Move ${plan.name} up`}
                        disabled={i === 0 || reorder.pending}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        label={`Move ${plan.name} down`}
                        disabled={i === list.length - 1 || reorder.pending}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </IconButton>
                    </div>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="size-7 shrink-0 rounded-md"
                      style={{ background: planGradient(plan.order ?? i) }}
                    />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        {plan.name}
                        {plan.is_default && <Badge tone="accent">default</Badge>}
                        {plan.is_free && <Badge tone="green">free</Badge>}
                        {plan.trial_eligible && <Badge tone="blue">trial</Badge>}
                        {plan.highlight_label && <Badge>{plan.highlight_label}</Badge>}
                        {!plan.is_active && <Badge tone="red">inactive</Badge>}
                      </p>
                      <p className="text-muted truncate text-[12px]">{plan.tagline || plan.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="tabular px-2 py-2.5 text-[13px]">{priceLabel(plan)}</td>
                <td className="tabular text-muted px-2 py-2.5 text-[13px]">
                  {short(plan.daily_limit_minutes)} · {short(plan.weekly_limit_minutes)} ·{" "}
                  {short(plan.monthly_limit_minutes)}
                </td>
                <td className="tabular px-2 py-2.5 text-right text-[13px]">
                  {plan.subscribers.toLocaleString()}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-0.5">
                    <IconButton label={`Edit ${plan.name}`} onClick={() => setEditing({ ...plan })}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    {writable && (
                      <IconButton
                        tone="danger"
                        label={`Delete ${plan.name}`}
                        disabled={plan.is_default || plan.subscribers > 0}
                        onClick={() => remove(plan)}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {plans.data?.length === 0 && (
          <Empty icon={<CreditCard className="size-8" />} title="No plans yet" />
        )}
      </Card>
      <PlanEditor
        draft={editing}
        readOnly={!writable}
        onClose={() => setEditing(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: KEY })}
      />
    </>
  );
}

/** Hours + minutes for one limit, or "No limit". */
function LimitInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
}) {
  const unlimited = value == null;
  const hours = unlimited ? 0 : Math.floor(value / 60);
  const minutes = unlimited ? 0 : value % 60;
  const set = (h: number, m: number) =>
    onChange(Math.max(1, Math.max(0, h) * 60 + Math.max(0, Math.min(59, m))));
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1.5 text-[12.5px] font-medium">{label}</legend>
      <div className="flex items-center gap-1.5">
        <div className="w-16 shrink-0">
          <Input
            id={`${id}-h`}
            aria-label={`${label} hours`}
            type="number"
            min={0}
            max={744}
            inputMode="numeric"
            disabled={unlimited}
            value={unlimited ? "" : hours}
            onChange={(e) => set(Number(e.target.value || 0), minutes)}
          />
        </div>
        <span className="text-muted text-[12px]">h</span>
        <div className="w-16 shrink-0">
          <Input
            aria-label={`${label} minutes`}
            type="number"
            min={0}
            max={59}
            inputMode="numeric"
            disabled={unlimited}
            value={unlimited ? "" : minutes}
            onChange={(e) => set(hours, Number(e.target.value || 0))}
          />
        </div>
        <span className="text-muted text-[12px]">m</span>
        <label className="text-muted ml-auto flex items-center gap-1.5 text-[12px] whitespace-nowrap">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => onChange(e.target.checked ? null : 60)}
            className="accent-[var(--accent)]"
          />
          No limit
        </label>
      </div>
    </fieldset>
  );
}

function PlanEditor({
  draft,
  readOnly,
  onClose,
  onSaved,
}: {
  draft: Draft | null;
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Draft>(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [bullets, setBullets] = useState("");
  useEffect(() => {
    if (!draft) return;
    setForm(draft);
    setBullets((draft.feature_bullets ?? []).join("\n"));
    setFields({});
  }, [draft]);
  const isNew = !draft?.id;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useAction(
    async () => {
      const body = {
        ...form,
        slug: form.slug || slugify(form.name),
        price_tzs: form.is_free ? 0 : form.price_tzs,
        feature_bullets: bullets
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean),
      };
      setFields({});
      try {
        if (isNew) await unwrap(api.POST("/api/v1/admin/plans", { body }));
        else
          await unwrap(
            api.PATCH("/api/v1/admin/plans/{id}", { params: { path: { id: form.id! } }, body }),
          );
      } catch (e) {
        const err = e as { fields?: Record<string, string> };
        if (err.fields) setFields(err.fields);
        throw e;
      }
      onSaved();
      onClose();
    },
    { success: isNew ? "Plan created" : "Plan saved — members on it see the change now" },
  );

  const preview = { ...form, feature_bullets: bullets.split("\n").filter((b) => b.trim()) };
  return (
    <Dialog.Root open={!!draft} onOpenChange={(o) => !o && !save.pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[140] bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="border-line bg-panel fixed inset-y-0 right-0 z-[141] flex w-[min(980px,96vw)] flex-col border-l shadow-2xl"
        >
          <div className="border-line flex items-center justify-between border-b px-5 py-3">
            <Dialog.Title className="font-semibold">
              {isNew ? "New plan" : `Edit ${draft?.name}`}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="hover:bg-hover grid size-8 place-items-center rounded-md"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <form
            className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1fr_340px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!readOnly) void save.run();
            }}
          >
            <fieldset disabled={readOnly || save.pending} className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="plan-name">Name</Label>
                  <Input
                    id="plan-name"
                    required
                    value={form.name}
                    invalid={!!fields.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                  <FieldError text={fields.name} />
                </div>
                <div>
                  <Label htmlFor="plan-slug" hint="URL id">
                    Slug
                  </Label>
                  <Input
                    id="plan-slug"
                    value={form.slug}
                    placeholder={slugify(form.name)}
                    invalid={!!fields.slug}
                    disabled={!isNew}
                    onChange={(e) => set("slug", slugify(e.target.value))}
                  />
                  <FieldError text={fields.slug} />
                </div>
              </div>
              <div>
                <Label htmlFor="plan-tagline">Tagline</Label>
                <Input
                  id="plan-tagline"
                  value={form.tagline ?? ""}
                  onChange={(e) => set("tagline", e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="plan-price" hint="TZS">
                    Price
                  </Label>
                  <Input
                    id="plan-price"
                    type="number"
                    min={0}
                    step={100}
                    inputMode="numeric"
                    disabled={!!form.is_free}
                    invalid={!!fields.price_tzs}
                    value={form.is_free ? 0 : (form.price_tzs ?? 0)}
                    onChange={(e) => set("price_tzs", Number(e.target.value || 0))}
                  />
                  <FieldError text={fields.price_tzs} />
                </div>
                <div>
                  <Label htmlFor="plan-period" hint="days">
                    Billing period
                  </Label>
                  <Input
                    id="plan-period"
                    type="number"
                    min={1}
                    max={366}
                    value={form.period_days ?? 30}
                    onChange={(e) => set("period_days", Number(e.target.value || 30))}
                  />
                </div>
                <div>
                  <Label htmlFor="plan-highlight" hint="ribbon">
                    Highlight
                  </Label>
                  <Input
                    id="plan-highlight"
                    placeholder="Most popular"
                    value={form.highlight_label ?? ""}
                    onChange={(e) => set("highlight_label", e.target.value)}
                  />
                </div>
              </div>
              <div className="border-line space-y-4 rounded-lg border p-4">
                <p className="text-[13px] font-medium">Viewing limits</p>
                {SCOPES.map(({ key, label }) => (
                  <div key={key}>
                    <LimitInput
                      label={label}
                      value={form[`${key}_limit_minutes`]}
                      onChange={(v) => set(`${key}_limit_minutes`, v)}
                    />
                    <FieldError text={fields[`${key}_limit_minutes`]} />
                  </div>
                ))}
                <p className="text-subtle text-[12px]">
                  Limits count only time spent playing. Give every plan a limit (even the biggest)
                  so heavy use stays predictable.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SwitchField
                  label="Active"
                  hint="Shown in the plan picker"
                  checked={form.is_active ?? true}
                  onChange={(v) => set("is_active", v)}
                />
                <SwitchField
                  label="Free trial"
                  hint="Eligible for the free trial"
                  checked={!!form.trial_eligible}
                  onChange={(v) => set("trial_eligible", v)}
                />
                <SwitchField
                  label="Free plan"
                  hint="Costs nothing; no payment details"
                  checked={!!form.is_free}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      is_free: v,
                      price_tzs: v ? 0 : f.price_tzs,
                      trial_eligible: v ? false : f.trial_eligible,
                    }))
                  }
                />
                <SwitchField
                  label="Default plan"
                  hint="New members start here (must be free)"
                  checked={!!form.is_default}
                  disabled={!form.is_free || !!draft?.is_default}
                  onChange={(v) => set("is_default", v)}
                />
              </div>
              <FieldError text={fields.is_default ?? fields.is_active} />
              <div>
                <Label htmlFor="plan-bullets" hint="one per line, up to 8">
                  Card bullets
                </Label>
                <Textarea
                  id="plan-bullets"
                  rows={4}
                  value={bullets}
                  onChange={(e) => setBullets(e.target.value)}
                />
                <FieldError text={fields.feature_bullets} />
              </div>
            </fieldset>
            <aside className="border-line bg-raised/40 border-t p-5 lg:border-t-0 lg:border-l">
              <p className="text-muted mb-3 text-[12px] font-medium tracking-wider uppercase">
                Live preview
              </p>
              <PlanPreview plan={preview} />
              {!readOnly && (
                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={save.pending} onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={save.pending}>
                    {isNew ? "Create plan" : "Save changes"}
                  </Button>
                </div>
              )}
            </aside>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SwitchField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="border-line flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-subtle text-[12px]">{hint}</p>
      </div>
      <Switch label={label} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function FieldError({ text }: { text?: string }) {
  return text ? <p className="mt-1 text-[12px] text-red-500">{text}</p> : null;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** The viewer's plan card (same look as the plan picker), on a white page. */
function PlanPreview({ plan }: { plan: Draft }) {
  return (
    <div className="rounded-xl bg-white p-3 text-[#333] [color-scheme:light]">
      <div className="relative rounded-2xl border-2 border-[#e50914] bg-white shadow-[0_8px_24px_rgb(0_0_0/0.18)]">
        {plan.highlight_label ? (
          <span className="absolute top-0 right-0 left-0 rounded-t-[14px] bg-[#e6e6e6] py-1 text-center text-[11px] font-bold">
            {plan.highlight_label}
          </span>
        ) : null}
        <div
          className={cn("relative m-2 rounded-xl p-4 text-white", plan.highlight_label && "mt-8")}
          style={{ background: planGradient(plan.order ?? 0) }}
        >
          <p className="text-[20px] font-bold">{plan.name || "Plan name"}</p>
          <p className="text-[13px] font-semibold opacity-90">
            {limitPhrase(plan.daily_limit_minutes, "day")}
          </p>
          <span className="absolute right-3 bottom-3 grid size-6 place-items-center rounded-full bg-white text-[#e50914]">
            <Check className="size-3.5" strokeWidth={3.5} />
          </span>
        </div>
        <dl className="px-4 pb-4 text-[13px]">
          <PreviewRow label="Price">{priceLabel(plan)}</PreviewRow>
          {SCOPES.map(({ key, label, per }) => (
            <PreviewRow key={key} label={label}>
              {limitPhrase(plan[`${key}_limit_minutes`], per)}
            </PreviewRow>
          ))}
          <PreviewRow label="Video quality">Best (same on every plan)</PreviewRow>
          {(plan.feature_bullets ?? [])
            .filter((b) => !/quality/i.test(b))
            .map((b) => (
              <PreviewRow key={b} label="Included">
                {b}
              </PreviewRow>
            ))}
        </dl>
      </div>
      <p className="mt-3 text-center text-[11.5px] text-[#737373]">
        {plan.is_active === false
          ? "Inactive: hidden from the plan picker."
          : "Shown to viewers as above."}
      </p>
    </div>
  );
}

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#e6e6e6] py-2 last:border-b-0">
      <dt className="text-[11.5px] text-[#737373]">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
