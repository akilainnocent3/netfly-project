"use client";

import { unwrap } from "@netfly/api-client";
import { cn, formatBytes } from "@netfly/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, Clock, Cpu, HardDrive, Play, Radio, Timer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BarsChart, TrendChart } from "@/components/dashboard/charts";
import { Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
] as const;
type Range = (typeof RANGES)[number]["value"];

const n = (v: number) => v.toLocaleString();
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);

export default function DashboardPage() {
  const [range, setRange] = useState<Range>("7d");
  const dash = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => unwrap(api.GET("/api/v1/admin/dashboard", { params: { query: { range } } })),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const d = dash.data;
  const series = (d?.series ?? []).map((p) => ({ ...p, label: new Date(`${p.date}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));
  const quality = Object.entries(d?.quality_mix ?? {})
    .map(([label, value]) => ({ label, value, h: Number.parseInt(label) || 0 }))
    .sort((a, b) => b.h - a.h);
  const tc = d?.transcoding ?? {};

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Audience, playback quality and pipeline health."
        actions={
          <div role="radiogroup" aria-label="Date range" className="flex rounded-md border border-line bg-panel p-0.5">
            {RANGES.map((r) => (
              <button key={r.value} type="button" role="radio" aria-checked={range === r.value} onClick={() => setRange(r.value)} className={cn("h-7 rounded px-2.5 text-[12.5px]", range === r.value ? "bg-hover font-medium" : "text-muted hover:text-fg")}>
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      <div className={cn("space-y-4 transition-opacity", dash.isPlaceholderData && "opacity-60")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Radio} label="Watching now" value={d ? n(d.active_viewers) : null} live />
          <Stat icon={Play} label="Plays today" value={d ? n(d.plays_today) : null} sub={d ? `${n(d.plays_7d)} in 7d · ${n(d.plays_30d)} in 30d` : undefined} />
          <Stat icon={Timer} label="Avg. startup time" value={d ? (d.avg_startup_ms != null ? ms(d.avg_startup_ms) : "—") : null} sub="Time to first frame" />
          <Stat icon={TriangleAlert} label="Plays with rebuffering" value={d ? (d.rebuffer_ratio != null ? `${(d.rebuffer_ratio * 100).toFixed(1)}%` : "—") : null} sub={d?.rebuffers_per_hour != null ? `${d.rebuffers_per_hour} stalls / watch hour` : "Lower is better"} />
          <Stat icon={Clock} label="Watch time" value={d ? `${n(d.watch_hours)} h` : null} sub={`In the selected range`} />
          <Stat icon={Activity} label="Viewers" value={d ? n(d.viewers_total) : null} sub={d ? `${d.titles_published} titles published` : undefined} />
          <Stat icon={Cpu} label="Transcoding" value={d ? `${(tc.transcoding ?? 0) + (tc.queued ?? 0)} in queue` : null} sub={d ? `${tc.failed ?? 0} failed · ${tc.ready ?? 0} ready` : undefined} href="/transcoding" warn={(tc.failed ?? 0) > 0} />
          <Stat icon={HardDrive} label="Storage used" value={d ? (d.storage_bytes != null ? formatBytes(d.storage_bytes) : "—") : null} sub={d?.storage_bytes == null ? "S3 listing unavailable" : "Media bucket prefix"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Plays per day" loading={!d}>
            <TrendChart data={series} dataKey="plays" format={n} />
          </ChartCard>
          <ChartCard title="Average startup time" loading={!d} note="Lower is better">
            {series.some((p) => p.startup_ms != null) ? <TrendChart data={series} dataKey="startup_ms" format={ms} /> : <EmptyChart text="Startup times appear after the first plays." />}
          </ChartCard>
          <ChartCard title="Rebuffers per play" loading={!d} note="Lower is better">
            {series.some((p) => p.rebuffers_per_play != null) ? <TrendChart data={series} dataKey="rebuffers_per_play" format={(v) => v.toFixed(2)} /> : <EmptyChart text="No plays in this range yet." />}
          </ChartCard>
          <ChartCard title="Quality switches by rendition" loading={!d} note="Where ABR spends time">
            {quality.length ? <BarsChart data={quality} format={n} /> : <EmptyChart />}
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="border-b border-line px-4 py-3 font-medium">Top titles</div>
            {!d ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7" />)}</div>
            ) : d.top_titles.length ? (
              <ol className="divide-y divide-line">
                {d.top_titles.map((t, i) => {
                  const max = d.top_titles[0]?.plays || 1;
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="w-5 text-right tabular text-[12px] text-subtle">{i + 1}</span>
                      <Link href={`/titles/${t.id}`} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
                      <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-raised sm:block" aria-hidden>
                        <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(t.plays / max) * 100}%` }} />
                      </div>
                      <span className="w-24 text-right tabular text-[12.5px] text-muted">{n(t.plays)} plays</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyChart text="No plays in this range yet." />
            )}
          </Card>
          <ChartCard title="New viewers per day" loading={!d}>
            <TrendChart data={series} dataKey="signups" format={n} height={220} />
          </ChartCard>
        </div>
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value, sub, live, href, warn }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | null; sub?: string; live?: boolean; href?: string; warn?: boolean }) {
  const body = (
    <Card className={cn("h-full p-4 transition-colors", href && "hover:border-fg/20")}>
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        <Icon className="size-3.5" />
        {label}
        {live && <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"><span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> live</span>}
        {warn && <TriangleAlert className="ml-auto size-3.5 text-red-500" aria-label="Needs attention" />}
      </div>
      {value === null ? <Skeleton className="mt-2 h-7 w-20" /> : <p className="mt-1.5 text-[24px] font-semibold tracking-tight tabular">{value}</p>}
      {sub && <p className="mt-0.5 truncate text-[12px] text-subtle">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function ChartCard({ title, note, loading, children }: { title: string; note?: string; loading: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-medium">{title}</p>
        {note && <span className="text-[11.5px] text-subtle">{note}</span>}
      </div>
      {loading ? <Skeleton className="h-[180px]" /> : children}
    </Card>
  );
}

function EmptyChart({ text = "No data in this range yet." }: { text?: string }) {
  return <div className="grid h-[180px] place-items-center text-[12.5px] text-muted">{text}</div>;
}
