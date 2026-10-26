"use client";

import { unwrap } from "@netfly/api-client";
import { cn, LazyLogoLoader } from "@netfly/ui";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Copy, Download, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/providers/toast";
import { IconButton } from "@/components/ui/actions";
import { Badge, Button, Card, Empty, Input, Select, Switch } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import {
  ACTIVE_JOB,
  KIND_LABEL,
  KIND_TONE,
  SOURCE_LABEL,
  type ExtractionJobDetail,
  type ExtractionLink,
} from "@/lib/extraction";
import { useDebounced } from "@/lib/use-debounced";

const PAGE_SIZE = 200;
const KIND_FILTERS = [
  ["", "All"],
  ["pages", "Pages"],
  ["videos", "Videos"],
  ["embeds", "Embeds"],
  ["other", "Other"],
] as const;
const ORDERINGS = [
  ["id", "Order found"],
  ["url", "URL A–Z"],
  ["-url", "URL Z–A"],
  ["kind", "Kind"],
  ["depth", "Depth"],
  ["-http_status", "HTTP status (high first)"],
  ["check_status", "Check status"],
] as const;
const CHECK_TONE = {
  unchecked: "neutral",
  checking: "amber",
  checked: "green",
  failed: "red",
} as const;

function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return phone;
}

/**
 * Every link of a crawl. Pages of 200 load as the list scrolls and only visible rows render, so
 * thousands of links stay fast. Arrow keys move between rows, Enter opens the overview.
 */
export function LinksTable({
  job,
  onOpen,
}: {
  job: ExtractionJobDetail;
  onOpen: (link: ExtractionLink) => void;
}) {
  const ids = useId();
  const toast = useToast();
  const phone = useIsPhone();
  const [kind, setKind] = useState("");
  const [internal, setInternal] = useState("");
  const [checkStatus, setCheckStatus] = useState("");
  const [hasVideo, setHasVideo] = useState(false);
  const [ordering, setOrdering] = useState("id");
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 300);
  const filters = {
    kind: kind || undefined,
    internal: internal ? internal === "true" : undefined,
    check_status: (checkStatus || undefined) as ExtractionLink["check_status"] | undefined,
    has_video: hasVideo || undefined,
    search: query || undefined,
    ordering: ordering as never,
  };
  const active = ACTIVE_JOB.includes(job.status);
  const links = useInfiniteQuery({
    // The status is in the key: the list refetches once more when the crawl finishes.
    queryKey: ["extraction", "links", job.id, job.status, filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/admin/extraction/jobs/{id}/links", {
          params: {
            path: { id: job.id },
            query: { ...filters, page: pageParam, page_size: PAGE_SIZE } as never,
          },
        }),
      ),
    getNextPageParam: (last, all) => (last.next ? all.length + 1 : undefined),
    placeholderData: keepPreviousData,
    refetchInterval: active ? 3000 : false,
  });
  const rows = useMemo(() => links.data?.pages.flatMap((p) => p.results) ?? [], [links.data]);
  const total = links.data?.pages[0]?.count ?? 0;

  const scroller = useRef<HTMLDivElement>(null);
  const rowHeight = phone ? 68 : 40;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? 0;
  useEffect(() => {
    if (lastIndex >= rows.length - 30 && links.hasNextPage && !links.isFetchingNextPage) {
      void links.fetchNextPage();
    }
  }, [lastIndex, rows.length, links]);

  // Roving focus: one row is in the tab order; arrows move it.
  const [focused, setFocused] = useState(0);
  useEffect(() => {
    setFocused(0);
  }, [kind, internal, checkStatus, hasVideo, ordering, query]);
  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    setFocused(next);
    virtualizer.scrollToIndex(next, { align: "auto" });
    requestAnimationFrame(() =>
      scroller.current?.querySelector<HTMLElement>(`[data-row="${next}"]`)?.focus(),
    );
  };
  const onKeyDown = (e: React.KeyboardEvent, index: number, link: ExtractionLink) => {
    const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 400) / rowHeight) - 1);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      PageDown: index + page,
      PageUp: index - page,
      Home: 0,
      End: rows.length - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      focusRow(moves[e.key]!);
    } else if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
      e.preventDefault();
      onOpen(link);
    }
  };

  const [copied, setCopied] = useState<number | null>(null);
  const copy = async (link: ExtractionLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
      setTimeout(() => setCopied((c) => (c === link.id ? null : c)), 1500);
    } catch {
      toast("Couldn't copy — select the address in the overview instead.", "error");
    }
  };

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      // The typed client (it refreshes the session); `format=csv` picks the CSV renderer.
      const { data: blob, response } = await api.GET("/api/v1/admin/extraction/jobs/{id}/links", {
        params: { path: { id: job.id }, query: { ...filters, format: "csv" } as never },
        parseAs: "blob",
      });
      if (!response.ok || !blob) throw new Error(`HTTP ${response.status}`);
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
        "links.csv";
      const href = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      toast("Couldn't export the links. Try again.", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 className="mr-auto font-semibold" id={`${ids}-title`}>
          Links{" "}
          <span className="text-muted tabular text-[13px] font-normal">
            {links.isPending ? "" : `${total.toLocaleString()}${active ? " so far" : ""}`}
          </span>
        </h2>
        <Button size="sm" onClick={() => void exportCsv()} loading={exporting} disabled={!total}>
          <Download className="size-3.5" aria-hidden /> Export CSV
        </Button>
      </div>
      <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1">
          {KIND_FILTERS.map(([value, label]) => (
            <Button
              key={label}
              size="sm"
              role="radio"
              aria-checked={kind === value}
              variant={kind === value ? "secondary" : "ghost"}
              onClick={() => setKind(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search
            className="text-subtle pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search URL or title"
            aria-label="Search links"
            className="pl-7"
          />
        </div>
        <Select value={internal} onChange={(e) => setInternal(e.target.value)} aria-label="Site">
          <option value="">This site and others</option>
          <option value="true">This site</option>
          <option value="false">Other sites</option>
        </Select>
        <Select
          value={checkStatus}
          onChange={(e) => setCheckStatus(e.target.value)}
          aria-label="Check status"
        >
          <option value="">Any check status</option>
          <option value="unchecked">Not checked</option>
          <option value="checking">Checking</option>
          <option value="checked">Checked</option>
          <option value="failed">Check failed</option>
        </Select>
        <Select value={ordering} onChange={(e) => setOrdering(e.target.value)} aria-label="Sort">
          {ORDERINGS.map(([value, label]) => (
            <option key={value} value={value}>
              Sort: {label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-[12.5px]">
          <Switch checked={hasVideo} onCheckedChange={setHasVideo} label="Has video" />
          Has video
        </label>
      </div>

      {links.isPending ? (
        <div className="relative grid h-72 place-items-center" aria-busy>
          <LazyLogoLoader size="md" label="Loading links" />
        </div>
      ) : !rows.length ? (
        <Empty
          icon={<Search className="size-8" />}
          title={active ? "No links yet" : "No links here"}
        >
          {active ? "Links appear as pages are crawled." : "Try another filter or search."}
        </Empty>
      ) : (
        <div
          role="grid"
          aria-labelledby={`${ids}-title`}
          aria-rowcount={total + 1}
          aria-busy={links.isFetching || undefined}
          className="text-[12.5px]"
        >
          <div
            role="row"
            aria-rowindex={1}
            className="border-line text-muted hidden h-9 items-center gap-3 border-b px-4 font-medium md:flex"
          >
            <span role="columnheader" className="min-w-0 flex-1">
              URL
            </span>
            <span role="columnheader" className="w-24">
              Kind
            </span>
            <span role="columnheader" className="w-28">
              Source
            </span>
            <span role="columnheader" className="hidden w-48 lg:block">
              Found on
            </span>
            <span role="columnheader" className="w-14 text-right">
              HTTP
            </span>
            <span role="columnheader" className="w-28">
              Check
            </span>
          </div>
          <div
            ref={scroller}
            className="relative h-[min(62vh,640px)] min-h-72 overflow-y-auto overscroll-contain"
          >
            <div style={{ height: virtualizer.getTotalSize() }} className="relative">
              {items.map((item) => {
                const link = rows[item.index]!;
                return (
                  <div
                    key={link.id}
                    role="row"
                    aria-rowindex={item.index + 2}
                    data-row={item.index}
                    tabIndex={item.index === focused ? 0 : -1}
                    onFocus={() => setFocused(item.index)}
                    onClick={() => onOpen(link)}
                    onKeyDown={(e) => onKeyDown(e, item.index, link)}
                    aria-label={`${KIND_LABEL[link.kind]}: ${link.url}`}
                    className={cn(
                      "border-line hover:bg-hover focus-visible:bg-hover focus-visible:ring-accent absolute inset-x-0 flex cursor-pointer gap-x-3 border-b px-4 outline-none focus-visible:ring-2 focus-visible:ring-inset",
                      phone ? "flex-wrap content-center gap-y-1" : "items-center",
                    )}
                    style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  >
                    <div
                      role="gridcell"
                      className="flex min-w-0 flex-1 basis-full items-center gap-1 md:basis-0"
                    >
                      <span className="min-w-0 flex-1 truncate" title={link.url}>
                        {link.url}
                      </span>
                      <IconButton
                        size="sm"
                        label={copied === link.id ? "Copied" : "Copy URL"}
                        tabIndex={item.index === focused ? 0 : -1}
                        onClick={(e) => {
                          e.stopPropagation();
                          void copy(link);
                        }}
                      >
                        {copied === link.id ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </IconButton>
                    </div>
                    <div role="gridcell" className="md:w-24">
                      <Badge tone={KIND_TONE[link.kind]}>{KIND_LABEL[link.kind]}</Badge>
                    </div>
                    <div role="gridcell" className="text-muted truncate md:w-28">
                      {SOURCE_LABEL[link.source] ?? link.source}
                      {!link.is_internal && " · other site"}
                    </div>
                    <div
                      role="gridcell"
                      className="text-muted hidden w-48 truncate lg:block"
                      title={link.found_on}
                    >
                      {link.found_on ? link.found_on.replace(/^https?:\/\//, "") : "—"}
                    </div>
                    <div
                      role="gridcell"
                      className={cn(
                        "tabular md:w-14 md:text-right",
                        (link.http_status ?? 0) >= 400 || link.error
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted",
                      )}
                      title={link.error || undefined}
                    >
                      {link.http_status ?? (link.error ? "error" : "—")}
                    </div>
                    <div role="gridcell" className="md:w-28">
                      <Badge tone={CHECK_TONE[link.check_status]} className="whitespace-nowrap">
                        {link.check_status === "unchecked" ? "not checked" : link.check_status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
            {links.isFetchingNextPage && (
              <div className="sticky bottom-0 grid place-items-center py-2">
                <LazyLogoLoader size="sm" label="Loading more links" />
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
