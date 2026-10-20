"use client";

import { unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";

const AREAS = ["", "config", "title", "season", "episode", "related", "genre", "image", "video", "upload", "user", "staff", "home_row", "billboard", "collection", "legal", "storage"];

export default function AuditPage() {
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [area, setArea] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const search = useDebounced(q, 250);
  const actorQ = useDebounced(actor, 250);
  const logs = useQuery({
    queryKey: ["audit", search, actorQ, area, page],
    queryFn: () => unwrap(api.GET("/api/v1/admin/audit", { params: { query: { search: search || undefined, actor: actorQ || undefined, action: area ? `${area}.` : undefined, page } } })),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title="Audit log" description="Every staff write and every settings change. Secrets are recorded as “changed”, never their values." />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input className="pl-8" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search audit log" />
        </div>
        <div className="w-40"><Input placeholder="Staff username" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} aria-label="Filter by staff" /></div>
        <Select value={area} onChange={(e) => { setArea(e.target.value); setPage(1); }} aria-label="Area">
          {AREAS.map((a) => <option key={a} value={a}>{a ? a.replace("_", " ") : "All areas"}</option>)}
        </Select>
      </div>
      <Card className="overflow-hidden">
        {logs.isPending ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div> : logs.data?.results.length ? (
          <ul className={cn("divide-y divide-line", logs.isPlaceholderData && "opacity-60")}>
            {logs.data.results.map((log) => (
              <li key={log.id}>
                <button type="button" onClick={() => setOpen(open === log.id ? null : log.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover">
                  <Badge>{log.action}</Badge>
                  <span className="min-w-0 flex-1 truncate">{log.target_repr || log.target_type}</span>
                  <span className="text-[12px] text-muted">{log.actor ? `@${log.actor}` : "system"}</span>
                  <span className="w-40 text-right tabular text-[12px] text-subtle">{new Date(log.created_at).toLocaleString()}</span>
                </button>
                {open === log.id && (
                  <pre className="mx-4 mb-3 max-h-64 overflow-auto rounded-md bg-raised p-3 font-mono text-[11.5px]">{JSON.stringify(log.changes, null, 2)}{log.ip_address ? `\n\nfrom ${log.ip_address}` : ""}</pre>
                )}
              </li>
            ))}
          </ul>
        ) : <Empty icon={<ScrollText className="size-8" />} title="Nothing logged here yet" />}
        {logs.data && logs.data.count > 25 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[12.5px] text-muted">
            <span>{logs.data.count} entries</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="ghost" disabled={!logs.data.next} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
