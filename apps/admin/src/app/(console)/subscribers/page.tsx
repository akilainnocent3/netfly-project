"use client";

import { unwrap, type Schemas } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { useAction, useConfirm } from "@/components/ui/actions";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";

type Status = Schemas["SubscriptionStatusEnum"];
type ScopeKey = "day" | "week" | "month";

const STATUSES: Status[] = [
  "free",
  "trialing",
  "active",
  "past_due",
  "grace",
  "canceled",
  "expired",
];
const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "red" | "blue" | "accent"> = {
  free: "neutral",
  trialing: "blue",
  active: "green",
  past_due: "amber",
  grace: "amber",
  canceled: "neutral",
  expired: "red",
};

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const hm = (seconds: number | null | undefined) => {
  if (seconds == null) return "∞";
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export default function SubscribersPage() {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const search = useDebounced(q, 250);
  // Dashboard tiles link here pre-filtered (?status=trialing).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("status");
    if (wanted && (STATUSES as string[]).includes(wanted)) setStatus(wanted);
  }, []);
  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/plans")),
  });
  const subs = useQuery({
    queryKey: ["subscribers", search, plan, status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/admin/subscribers", {
          params: {
            query: {
              q: search || undefined,
              plan: plan || undefined,
              status: status || undefined,
              page,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Subscribers"
        description={
          subs.data ? `${subs.data.count.toLocaleString()} members` : "Plans, trials and usage."
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="text-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder="Username, name, email or phone…"
            value={q}
            aria-label="Search subscribers"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          aria-label="Plan"
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All plans</option>
          {plans.data?.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </Select>
      </div>
      <Card className="overflow-hidden">
        {/* Phones: the table scrolls inside its card, not the page. */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-line bg-raised/50 text-muted border-b text-[12px]">
              <tr>
                <th className="px-4 py-2 font-medium">Member</th>
                <th className="px-2 py-2 font-medium">Plan</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="hidden px-2 py-2 font-medium md:table-cell">Renews / ends</th>
                <th className="hidden px-4 py-2 text-right font-medium lg:table-cell">Contact</th>
              </tr>
            </thead>
            <tbody className={cn("divide-line divide-y", subs.isPlaceholderData && "opacity-60")}>
              {subs.isPending &&
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-2">
                      <Skeleton className="h-8" />
                    </td>
                  </tr>
                ))}
              {subs.data?.results.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className="hover:bg-hover cursor-pointer"
                  data-testid={`subscriber-${s.username}`}
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(s.id);
                      }}
                    >
                      {s.full_name}
                    </button>
                    <p className="text-muted text-[12px]">
                      @{s.username}
                      {s.is_staff ? " · staff (no limits)" : ""}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 text-[13px]">{s.plan ?? "—"}</td>
                  <td className="px-2 py-2.5">
                    <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>
                      {s.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="tabular text-muted hidden px-2 py-2.5 text-[12.5px] md:table-cell">
                    {s.status === "trialing"
                      ? `trial ends ${date(s.trial_end)}`
                      : date(s.current_period_end)}
                  </td>
                  <td className="text-muted hidden px-4 py-2.5 text-right text-[12px] lg:table-cell">
                    {[s.email_verified && s.email, s.phone_verified && s.phone]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {subs.data?.results.length === 0 && (
          <Empty icon={<Users className="size-8" />} title="No members match" />
        )}
        {subs.data && subs.data.count > 25 && (
          <div className="border-line flex justify-end gap-1 border-t px-4 py-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!subs.data.next}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
      <SubscriberDrawer id={selected} plans={plans.data ?? []} onClose={() => setSelected(null)} />
    </>
  );
}

function SubscriberDrawer({
  id,
  plans,
  onClose,
}: {
  id: number | null;
  plans: Schemas["AdminPlan"][];
  onClose: () => void;
}) {
  const { can } = useAuth();
  const writable = can();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [planSlug, setPlanSlug] = useState("");
  const [days, setDays] = useState(30);
  const [minutes, setMinutes] = useState(60);
  const [scope, setScope] = useState<ScopeKey>("day");
  const [reason, setReason] = useState("");
  const detail = useQuery({
    queryKey: ["subscriber", id],
    enabled: id !== null,
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/subscribers/{id}", { params: { path: { id: id! } } })),
  });
  const d = detail.data;
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/config")),
    enabled: writable,
  });
  const testMode = !!config.data
    ?.flatMap((g) => g.entries)
    .find((e) => e.key === "testing.mock_providers")?.value;

  type ActionPath =
    | "/api/v1/admin/subscribers/{id}/change-plan"
    | "/api/v1/admin/subscribers/{id}/extend"
    | "/api/v1/admin/subscribers/{id}/end-trial"
    | "/api/v1/admin/subscribers/{id}/cancel"
    | "/api/v1/admin/subscribers/{id}/reset-usage"
    | "/api/v1/admin/subscribers/{id}/bonus";
  const act = (
    path: ActionPath,
    body: Schemas["SubscriberActionRequest"],
    opts: { title: string; body: string; label: string; success: string; destructive?: boolean },
  ) =>
    id !== null &&
    confirm({
      title: opts.title,
      body: opts.body,
      confirmLabel: opts.label,
      destructive: opts.destructive,
      success: opts.success,
      action: async () => {
        const updated = await unwrap(api.POST(path, { params: { path: { id } }, body }));
        queryClient.setQueryData(["subscriber", id], updated);
        void queryClient.invalidateQueries({ queryKey: ["subscribers"] });
      },
    });

  return (
    <Dialog.Root open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[140] bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="border-line bg-panel fixed inset-y-0 right-0 z-[141] w-[min(560px,96vw)] overflow-y-auto border-l shadow-2xl"
        >
          <div className="border-line bg-panel sticky top-0 z-10 flex items-center justify-between border-b px-5 py-3">
            <Dialog.Title className="font-semibold">{d ? d.full_name : "Member"}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="hover:bg-hover grid size-8 place-items-center rounded-md"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {!d ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-20" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <div className="space-y-6 p-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                <Item label="Plan">
                  {d.plan}{" "}
                  <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>
                    {d.status.replace("_", " ")}
                  </Badge>
                </Item>
                <Item label="Username">@{d.username}</Item>
                <Item label={d.status === "trialing" ? "Trial ends" : "Period ends"}>
                  {date(d.status === "trialing" ? d.trial_end : d.current_period_end)}
                </Item>
                <Item label="Auto-renew">{d.auto_renew ? "On" : "Off"}</Item>
                <Item label="Email">
                  {d.email || "—"}{" "}
                  {d.email && (
                    <Badge tone={d.email_verified ? "green" : "neutral"}>
                      {d.email_verified ? "verified" : "unverified"}
                    </Badge>
                  )}
                </Item>
                <Item label="Phone">
                  {d.phone || "—"}{" "}
                  {d.phone && (
                    <Badge tone={d.phone_verified ? "green" : "neutral"}>
                      {d.phone_verified ? "verified" : "unverified"}
                    </Badge>
                  )}
                </Item>
                <Item label="Payment phone">{d.payment_phone || "—"}</Item>
                <Item label="Joined">{date(d.created_at)}</Item>
              </dl>

              <section>
                <h3 className="text-subtle mb-2 text-[12px] font-medium tracking-wider uppercase">
                  Usage
                </h3>
                {d.usage.exempt ? (
                  <p className="text-muted text-[12.5px]">Staff: no viewing limits.</p>
                ) : (
                  <ul className="space-y-3">
                    {(["day", "week", "month"] as const).map((s) => {
                      const limit = d.usage.limits[s];
                      const used = d.usage.used[s] ?? 0;
                      const ratio = limit ? Math.min(1, used / limit) : 0;
                      return (
                        <li key={s} data-testid={`sub-usage-${s}`}>
                          <div className="flex justify-between text-[12.5px]">
                            <span className="capitalize">
                              {s === "day" ? "Today" : `This ${s}`}
                            </span>
                            <span className="tabular text-muted">
                              {hm(used)} / {hm(limit)} · resets{" "}
                              {new Date(d.usage.resets_at[s]).toLocaleString(undefined, {
                                weekday: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <div className="bg-raised mt-1 h-1.5 overflow-hidden rounded-full">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                ratio >= 1 ? "bg-red-500" : "bg-accent",
                              )}
                              style={{ width: `${ratio * 100}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <PaymentsSection id={d.id} testMode={testMode} />

              {writable && (
                <section className="space-y-4">
                  <h3 className="text-subtle text-[12px] font-medium tracking-wider uppercase">
                    Actions
                  </h3>
                  <div className="border-line space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <Label htmlFor="sub-plan">Plan</Label>
                        <Select
                          id="sub-plan"
                          value={planSlug}
                          onChange={(e) => setPlanSlug(e.target.value)}
                        >
                          <option value="">Choose…</option>
                          {plans.map((p) => (
                            <option key={p.slug} value={p.slug}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="sub-days" hint="days">
                          Length
                        </Label>
                        <div className="w-20">
                          <Input
                            id="sub-days"
                            type="number"
                            min={1}
                            max={3650}
                            value={days}
                            onChange={(e) => setDays(Number(e.target.value || 1))}
                          />
                        </div>
                      </div>
                      <Button
                        disabled={!planSlug}
                        onClick={() =>
                          act(
                            "/api/v1/admin/subscribers/{id}/change-plan",
                            { plan: planSlug, days },
                            {
                              title: `Move ${d.username} to ${plans.find((p) => p.slug === planSlug)?.name}?`,
                              body: "Applies right now, without a payment. Paid plans run for the length you set.",
                              label: "Change plan",
                              success: "Plan changed",
                            },
                          )
                        }
                      >
                        Change plan
                      </Button>
                      <Button
                        disabled={d.status === "free"}
                        onClick={() =>
                          act(
                            "/api/v1/admin/subscribers/{id}/extend",
                            { days },
                            {
                              title: `Give ${d.username} ${days} more days?`,
                              body: "Extends the current paid period (or trial) without a payment.",
                              label: `Extend ${days} days`,
                              success: "Period extended",
                            },
                          )
                        }
                      >
                        Extend
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={d.status !== "trialing"}
                        onClick={() =>
                          act(
                            "/api/v1/admin/subscribers/{id}/end-trial",
                            {},
                            {
                              title: "End the free trial now?",
                              body: "The trial ends immediately; the renewal job then asks for payment (or moves them to the free plan).",
                              label: "End trial",
                              success: "Trial ended",
                              destructive: true,
                            },
                          )
                        }
                      >
                        End trial
                      </Button>
                      <Button
                        variant="danger"
                        disabled={d.status === "free"}
                        onClick={() =>
                          act(
                            "/api/v1/admin/subscribers/{id}/cancel",
                            { reason },
                            {
                              title: "Cancel this membership now?",
                              body: "They move to the free plan immediately. No refund is issued here.",
                              label: "Cancel membership",
                              success: "Moved to the free plan",
                              destructive: true,
                            },
                          )
                        }
                      >
                        Cancel membership
                      </Button>
                    </div>
                  </div>
                  <div className="border-line space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <Label htmlFor="sub-scope">Window</Label>
                        <Select
                          id="sub-scope"
                          value={scope}
                          onChange={(e) => setScope(e.target.value as ScopeKey)}
                        >
                          <option value="day">Today</option>
                          <option value="week">This week</option>
                          <option value="month">This month</option>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="sub-minutes" hint="min">
                          Bonus
                        </Label>
                        <div className="w-24">
                          <Input
                            id="sub-minutes"
                            type="number"
                            min={1}
                            value={minutes}
                            onChange={(e) => setMinutes(Number(e.target.value || 1))}
                          />
                        </div>
                      </div>
                      <Button
                        onClick={() =>
                          act(
                            "/api/v1/admin/subscribers/{id}/bonus",
                            { minutes, scope, reason },
                            {
                              title: `Give ${minutes} bonus minutes?`,
                              body: `Added to ${scope === "day" ? "today's" : `this ${scope}'s`} allowance only.`,
                              label: "Give minutes",
                              success: "Bonus minutes added",
                            },
                          )
                        }
                      >
                        Give minutes
                      </Button>
                      <Button
                        onClick={() =>
                          act(
                            "/api/v1/admin/subscribers/{id}/reset-usage",
                            { scope, reason },
                            {
                              title: "Reset this usage counter?",
                              body: `Everything used ${scope === "day" ? "today" : `this ${scope}`} is given back.`,
                              label: "Reset usage",
                              success: "Usage reset",
                            },
                          )
                        }
                      >
                        Reset usage
                      </Button>
                    </div>
                    <div>
                      <Label htmlFor="sub-reason" hint="kept in the audit log">
                        Reason
                      </Label>
                      <Input
                        id="sub-reason"
                        maxLength={200}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-subtle text-[12px]">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">{children}</dd>
    </div>
  );
}

const PAYMENT_TONE: Record<string, "neutral" | "green" | "amber" | "red"> = {
  completed: "green",
  pending: "amber",
  created: "amber",
  failed: "red",
  expired: "neutral",
  voided: "neutral",
};

/** The member's mobile-money requests; in test mode, simulated ones can be settled here. */
function PaymentsSection({ id, testMode }: { id: number; testMode: boolean }) {
  const queryClient = useQueryClient();
  const payments = useQuery({
    queryKey: ["subscriber-payments", id],
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/subscribers/{id}/payments", { params: { path: { id } } })),
  });
  const simulate = useAction(
    async (paymentId: string, outcome: "completed" | "failed") => {
      await unwrap(
        api.POST("/api/v1/admin/testing/payments/{payment_id}/simulate", {
          params: { path: { payment_id: paymentId } },
          body: { outcome },
        }),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscriber-payments", id] }),
        queryClient.invalidateQueries({ queryKey: ["subscriber", id] }),
        queryClient.invalidateQueries({ queryKey: ["subscribers"] }),
      ]);
    },
    { success: "Payment settled (simulated)" },
  );
  return (
    <section>
      <h3 className="text-subtle mb-2 text-[12px] font-medium tracking-wider uppercase">
        Payments
      </h3>
      {!payments.data ? (
        <Skeleton className="h-16" />
      ) : payments.data.length === 0 ? (
        <p className="text-muted text-[12.5px]">No payments yet.</p>
      ) : (
        <ul className="divide-line border-line divide-y rounded-md border">
          {payments.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]">
              <span className="tabular text-subtle w-20">
                {new Date(p.created_at).toLocaleDateString()}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {p.plan} · {p.purpose.replace("_", " ")} · {p.phone_masked}
                {p.failure_reason ? (
                  <span className="text-muted"> — {p.failure_reason}</span>
                ) : null}
              </span>
              <span className="tabular">TSh {p.amount.toLocaleString()}</span>
              <Badge tone={PAYMENT_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
              {testMode && p.status === "pending" && p.reference?.startsWith("mock_") ? (
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    loading={simulate.pending}
                    onClick={() => void simulate.run(p.id, "completed")}
                  >
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={simulate.pending}
                    onClick={() => void simulate.run(p.id, "failed")}
                  >
                    Fail
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
