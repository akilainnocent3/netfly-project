"use client";

import { unwrap } from "@netfly/api-client";
import { LazyLogoLoader } from "@netfly/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, Globe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Empty, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { ACTIVE_JOB, hostOf, type ExtractionJob } from "@/lib/extraction";

export const JOB_TONE = {
  queued: "blue",
  crawling: "amber",
  done: "green",
  failed: "red",
  cancelled: "neutral",
} as const;

export function JobStatus({ job }: { job: Pick<ExtractionJob, "status"> }) {
  return <Badge tone={JOB_TONE[job.status] ?? "neutral"}>{job.status}</Badge>;
}

/** Recent crawls (everyone's), newest first; refreshes while one is running. */
export function JobsList() {
  const [page, setPage] = useState(1);
  const jobs = useQuery({
    queryKey: ["extraction", "jobs", page],
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/extraction/jobs", { params: { query: { page } } })),
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.results.some((j) => ACTIVE_JOB.includes(j.status)) ? 2000 : 15_000,
  });
  const pages = jobs.data ? Math.max(1, Math.ceil(jobs.data.count / 25)) : 1;
  return (
    <Card className="overflow-hidden">
      <div className="border-line border-b px-4 py-3">
        <h2 className="font-semibold">Recent checks</h2>
      </div>
      {jobs.isPending ? (
        <div aria-busy className="relative space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
          <div className="absolute inset-0 grid place-items-center">
            <LazyLogoLoader size="md" label="Loading recent checks" />
          </div>
        </div>
      ) : jobs.data?.results.length ? (
        <ul className="divide-line divide-y">
          {jobs.data.results.map((job) => (
            <li key={job.id}>
              <Link
                href={`/extraction/${job.id}`}
                className="hover:bg-hover focus-visible:bg-hover flex items-center gap-3 px-4 py-3 outline-none"
              >
                <Globe className="text-subtle size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{hostOf(job.start_url)}</p>
                  <p className="text-muted truncate text-[12px]">
                    {job.start_url} · {job.pages_crawled} pages · {job.links_found} links ·{" "}
                    {job.created_by_name || "—"} · {new Date(job.created_at).toLocaleString()}
                  </p>
                  {job.status === "failed" && job.error && (
                    <p className="truncate text-[12px] text-red-600 dark:text-red-400">
                      {job.error}
                    </p>
                  )}
                </div>
                {ACTIVE_JOB.includes(job.status) && (
                  <span className="tabular text-muted text-[12px]">
                    {Math.round(job.progress)}%
                  </span>
                )}
                <JobStatus job={job} />
                <ChevronRight className="text-subtle size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={<Globe className="size-8" />} title="No checks yet">
          Enter a site address above and press Check links.
        </Empty>
      )}
      {pages > 1 && (
        <div className="border-line text-muted flex items-center justify-between border-t px-4 py-2 text-[12.5px]">
          <span>
            Page {page} of {pages}
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
              disabled={!jobs.data?.next}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
