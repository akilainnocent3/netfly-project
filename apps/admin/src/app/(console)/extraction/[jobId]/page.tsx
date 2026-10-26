"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn, LazyLogoLoader } from "@netfly/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, Film, Info, X } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { JobStatus } from "@/components/extraction/jobs-list";
import { LinksTable } from "@/components/extraction/links-table";
import { OverviewPanel } from "@/components/extraction/overview-panel";
import { RoleGate } from "@/components/extraction/role-gate";
import { useConfirm } from "@/components/ui/actions";
import { Badge, Button, Card, Empty, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import {
  ACTIVE_JOB,
  KIND_LABEL,
  KIND_TONE,
  hostOf,
  type ExtractionJobDetail,
  type ExtractionLink,
} from "@/lib/extraction";

export default function ExtractionJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  return (
    <RoleGate>
      <JobView jobId={jobId} />
    </RoleGate>
  );
}

function JobView({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState<ExtractionLink | null>(null);
  const job = useQuery({
    queryKey: ["extraction", "job", jobId],
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/extraction/jobs/{id}", { params: { path: { id: jobId } } })),
    refetchInterval: (q) =>
      q.state.data && ACTIVE_JOB.includes(q.state.data.status) ? 1000 : false,
  });

  if (job.isPending) {
    return (
      <div aria-busy className="relative space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-28" />
        <Skeleton className="h-96" />
        <div className="absolute inset-0 grid place-items-center">
          <LazyLogoLoader size="md" label="Loading the check" />
        </div>
      </div>
    );
  }
  if (job.isError || !job.data) {
    return (
      <Card>
        <Empty icon={<CircleAlert className="size-8" />} title="This check doesn't exist">
          It may have been deleted after {""}
          <Link href="/extraction" className="text-accent underline">
            the retention period
          </Link>
          .
        </Empty>
      </Card>
    );
  }
  const data = job.data;
  const active = ACTIVE_JOB.includes(data.status);
  const cancel = () =>
    confirm({
      title: "Stop this check?",
      body: "Links found so far are kept.",
      confirmLabel: "Stop check",
      destructive: true,
      success: "Check stopped",
      action: async () => {
        await unwrap(
          api.POST("/api/v1/admin/extraction/jobs/{id}/cancel", {
            params: { path: { id: jobId } },
          }),
        ).catch((e: unknown) => {
          if (!(e instanceof ApiError && e.code === "not_running")) throw e;
        });
        await queryClient.invalidateQueries({ queryKey: ["extraction"] });
      },
    });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <Link
          href="/extraction"
          aria-label="Back to Video extraction"
          className="text-muted hover:bg-hover hover:text-fg grid size-8 shrink-0 place-items-center rounded-md"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] font-semibold tracking-tight">
            {hostOf(data.start_url)}
          </h1>
          <p className="text-muted truncate text-[13px]">{data.start_url}</p>
        </div>
        <JobStatus job={data} />
        {active && (
          <Button variant="secondary" onClick={cancel}>
            <X className="size-3.5" aria-hidden /> Cancel
          </Button>
        )}
      </div>
      <Progress job={data} />
      <VideosFound job={data} onOpen={setOpen} />
      <LinksTable job={data} onOpen={setOpen} />
      <OverviewPanel link={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Progress({ job }: { job: ExtractionJobDetail }) {
  const active = ACTIVE_JOB.includes(job.status);
  return (
    <Card className="mb-4 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pages crawled" value={job.pages_crawled} />
        <Stat label="Links found" value={job.links_found} />
        <Stat
          label="Videos & players"
          value={job.kind_counts.video_file + job.kind_counts.stream + job.kind_counts.embed}
        />
        <Stat label="Progress" value={`${Math.round(job.progress)}%`} />
      </div>
      <div
        className="bg-raised mt-3 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Crawl progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job.progress)}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            job.status === "failed" ? "bg-red-500" : "bg-accent",
          )}
          style={{ width: `${job.status === "failed" ? 100 : job.progress}%` }}
        />
      </div>
      {/* One polite live region: the status line, not every counter tick. */}
      <p role="status" aria-live="polite" className="text-muted mt-2 truncate text-[12.5px]">
        {job.status === "queued"
          ? "Waiting for an extraction worker…"
          : job.status === "crawling"
            ? `Crawling ${job.current_url || job.start_url}`
            : job.status === "done"
              ? `Finished: ${job.pages_crawled} pages, ${job.links_found} links.`
              : job.status === "cancelled"
                ? "Stopped. Links found so far are kept."
                : ""}
      </p>
      {job.status === "failed" && (
        <p className="mt-1 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">
          <CircleAlert className="size-4 shrink-0" aria-hidden /> {job.error}
        </p>
      )}
      {!active && job.notes.length > 0 && (
        <ul className="text-muted mt-2 space-y-0.5 text-[12.5px]">
          {job.notes.map((note) => (
            <li key={note} className="flex gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {note}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-muted text-[12px]">{label}</p>
      <p className="tabular text-[22px] font-semibold">{value}</p>
    </div>
  );
}

/** What the crawl itself found that looks like video, first — the usual reason to be here. */
function VideosFound({
  job,
  onOpen,
}: {
  job: ExtractionJobDetail;
  onOpen: (link: ExtractionLink) => void;
}) {
  if (!job.video_links.length && ACTIVE_JOB.includes(job.status)) return null;
  return (
    <Card className="mb-4 overflow-hidden">
      <div className="border-line flex items-center gap-2 border-b px-4 py-3">
        <Film className="text-subtle size-4" aria-hidden />
        <h2 className="font-semibold">Videos found</h2>
        <span className="text-muted text-[12.5px]">
          {job.video_links.length
            ? "Open one to check whether NETFLY can embed it."
            : "The crawl found no video files, streams or players. Open a page below to check it."}
        </span>
      </div>
      {job.video_links.length > 0 && (
        <ul className="divide-line grid divide-y md:grid-cols-2 md:divide-y-0">
          {job.video_links.map((link) => (
            <li key={link.id} className="md:border-line md:border-b md:odd:border-r">
              <button
                type="button"
                onClick={() => onOpen(link)}
                className="hover:bg-hover focus-visible:bg-hover flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none"
              >
                <Badge tone={KIND_TONE[link.kind]}>{KIND_LABEL[link.kind]}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{link.title || link.url}</span>
                  <span className="text-muted block truncate text-[12px]">{link.url}</span>
                </span>
                {link.check_status === "checked" && <Badge tone="green">checked</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
