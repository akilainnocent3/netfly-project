"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { stroke: "var(--viz-axis)", fontSize: 11.5, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12px] shadow-lg">
      <p className="text-muted">{label}</p>
      <p className="font-semibold tabular">{format(payload[0]!.value)}</p>
    </div>
  );
}

/** One measure over time (single series → no legend; the card title names it). */
export function TrendChart({ data, dataKey, format, height = 180 }: { data: Array<Record<string, number | string | null>>; dataKey: string; format: (v: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="label" {...axis} minTickGap={24} />
        <YAxis {...axis} width={44} tickFormatter={(v: number) => format(v)} allowDecimals={false} />
        <Tooltip cursor={{ stroke: "var(--viz-axis)", strokeDasharray: "3 3" }} content={<ChartTooltip format={format} />} />
        <Area type="monotone" dataKey={dataKey} stroke="var(--series-1)" strokeWidth={2} fill={`url(#fill-${dataKey})`} connectNulls activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--a-panel)" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Magnitude per category, one hue, rounded data-ends. */
export function BarsChart({ data, format, height = 180 }: { data: Array<{ label: string; value: number }>; format: (v: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={44} allowDecimals={false} />
        <Tooltip cursor={{ fill: "var(--a-hover)" }} content={<ChartTooltip format={format} />} />
        <Bar dataKey="value" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
