"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn, formatBytes, formatDuration } from "@netfly/ui";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Cpu, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
import { Badge, Button, Card, Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";

const FILTERS = [
  { value: "", label: "All" },
  { value: "queued,transcoding,uploaded", label: "Active" },
  { value: "failed", label: "Failed" },
  { value: "ready", label: "Ready" },
  { value: "uploading", label: "Uploading" },
];
const TONE = {
  ready: "green",
  failed: "red",
  transcoding: "amber",
  queued: "blue",
  uploaded: "blue",
  uploading: "neutral",
} as const;

export default function TranscodingPage() {
  const toast = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const stats = useQuery({
    queryKey: ["videos", "stats"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/videos/stats")),
    refetchInterval: 3000,
  });
  const jobs = useQuery({
    queryKey: ["videos", "list", status, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/admin/videos", {
          params: { query: { status: status || undefined, page } },
        }),
      ),
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.results.some((j) => ["queued", "transcoding", "uploaded"].includes(j.status))
        ? 2000
        : 10000,
  });
  const retry = async (id: string) => {
    try {
      await unwrap(api.POST("/api/v1/admin/videos/{id}/retry", { params: { path: { id } } }));
      toast("Queued again");
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Retry failed", "error");
    }
  };
  const s = stats.data;
  return (
    <>
      <PageHeader
        title="Transcoding"
        description="Live queue on the dedicated transcode workers. Updates every few seconds."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {(["transcoding", "queued", "uploading", "failed", "ready"] as const).map((k) => (
          <Card key={k} className="p-3">
            <p className="text-muted text-[12px] capitalize">{k}</p>
            {s ? (
              <p
                className={cn(
                  "tabular text-[22px] font-semibold",
                  k === "failed" && s[k] > 0 && "text-red-500",
                )}
              >
                {s[k]}
              </p>
            ) : (
              <Skeleton className="mt-1 h-7 w-10" />
            )}
          </Card>
        ))}
      </div>
      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.label}
            size="sm"
            variant={status === f.value ? "secondary" : "ghost"}
            onClick={() => {
              setStatus(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {jobs.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : jobs.data?.results.length ? (
          <ul className="divide-line divide-y">
            {jobs.data.results.map((job) => {
              const active = ["queued", "transcoding", "uploaded"].includes(job.status);
              const expanded = open === job.id;
              return (
                <li key={job.id}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : job.id)}
                      aria-expanded={expanded}
                      aria-label="Details"
                      className="text-subtle hover:text-fg"
                    >
                      <ChevronDown
                        className={cn("size-4 transition-transform", !expanded && "-rotate-90")}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{job.original_filename || job.id}</p>
                      <p className="text-muted truncate text-[12px]">
                        {job.usage.join(" · ") || "Not attached to a title"} · {job.kind}
                        {job.source_size ? ` · ${formatBytes(job.source_size)}` : ""}
                        {job.duration ? ` · ${formatDuration(job.duration)}` : ""}
                      </p>
                    </div>
                    <div className="w-56">
                      {active ? (
                        <>
                          <div className="text-muted mb-1 flex justify-between text-[11.5px]">
                            <span className="truncate">{job.stage || "Waiting for a worker"}</span>
                            <span className="tabular">{Math.round(job.progress ?? 0)}%</span>
                          </div>
                          <div className="bg-raised h-1.5 overflow-hidden rounded-full">
                            <div
                              className="bg-accent h-full rounded-full transition-[width] duration-700"
                              style={{ width: `${job.progress ?? 0}%` }}
                            />
                          </div>
                        </>
                      ) : job.status === "ready" ? (
                        <p className="text-muted truncate text-[12px]">
                          {job.renditions.map((r) => r.name).join(" · ")}
                        </p>
                      ) : job.status === "failed" ? (
                        <p className="truncate text-[12px] text-red-500">{job.error}</p>
                      ) : null}
                    </div>
                    <Badge tone={TONE[job.status as keyof typeof TONE] ?? "neutral"}>
                      {job.status}
                    </Badge>
                    {job.status === "failed" && can("content_manager") && (
                      <Button size="sm" onClick={() => void retry(job.id)}>
                        <RotateCcw className="size-3.5" /> Retry
                      </Button>
                    )}
                  </div>
                  {expanded && (
                    <div className="border-line bg-raised/40 grid gap-3 border-t px-11 py-3 text-[12.5px] md:grid-cols-3">
                      <Info label="Source">
                        {job.source_width
                          ? `${job.source_width}×${job.source_height} · ${job.source_fps?.toFixed(2)} fps · ${job.source_codec}`
                          : "—"}
                      </Info>
                      <Info label="Attempts">{job.attempts}</Info>
                      <Info label="Timing">
                        {job.started_at
                          ? `Started ${new Date(job.started_at).toLocaleString()}`
                          : job.queued_at
                            ? `Queued ${new Date(job.queued_at).toLocaleString()}`
                            : "—"}
                        {job.finished_at
                          ? ` · finished ${new Date(job.finished_at).toLocaleTimeString()}`
                          : ""}
                      </Info>
                      {job.log && (
                        <div className="md:col-span-3">
                          <p className="text-muted mb-1">FFmpeg log (tail)</p>
                          <pre className="bg-panel ring-line max-h-64 overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed ring-1">
                            {job.log}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={<Cpu className="size-8" />} title="No jobs here">
            Uploads appear as soon as they finish transferring to S3.
          </Empty>
        )}
        {jobs.data && jobs.data.count > 25 && (
          <div className="border-line text-muted flex items-center justify-between border-t px-4 py-2 text-[12.5px]">
            <span>
              Page {page} of {Math.ceil(jobs.data.count / 25)}
            </span>
            <div className="flex gap-1">
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
                disabled={!jobs.data.next}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
