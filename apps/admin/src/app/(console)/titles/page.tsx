"use client";

import { unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ChevronLeft, ChevronRight, Clapperboard, Plus, Search, Star, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { StatusChip, TranslationChip, VideoChip } from "@/components/catalog/status";
import { Thumb } from "@/components/catalog/thumb";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Empty, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";

type Filters = { search: string; type: string; status: string; translation: string; genre: string; page: number };
type BulkAction = "publish" | "archive" | "draft" | "feature" | "unfeature";

function TitlesTable() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({
    search: params.get("search") ?? "",
    type: params.get("type") ?? "",
    status: params.get("status") ?? "",
    translation: params.get("translation") ?? "",
    genre: params.get("genre") ?? "",
    page: Number(params.get("page") ?? 1),
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const search = useDebounced(filters.search, 250);

  // Filters apply instantly and live in the URL so views are shareable.
  useEffect(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, search })) if (v && !(k === "page" && v === 1)) q.set(k, String(v));
    router.replace(`/titles${q.size ? `?${q}` : ""}`, { scroll: false });
  }, [filters, search, router]);

  const genres = useQuery({ queryKey: ["genres"], queryFn: () => unwrap(api.GET("/api/v1/admin/genres")) });
  const list = useQuery({
    queryKey: ["titles", { ...filters, search }],
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/admin/titles", {
          params: {
            query: {
              search: search || undefined,
              type: (filters.type || undefined) as "movie" | "series" | undefined,
              status: (filters.status || undefined) as "draft" | undefined,
              translation: (filters.translation || undefined) as "translated" | undefined,
              genre: filters.genre ? Number(filters.genre) : undefined,
              page: filters.page,
              page_size: 25,
            },
          },
        }),
      ),
  });

  const bulk = useMutation({
    mutationFn: (action: BulkAction) => unwrap(api.POST("/api/v1/admin/titles/bulk", { body: { ids: [...selected], action } })),
    onSuccess: (result, action) => {
      const skipped = Object.keys(result.skipped).length;
      toast(`${result.updated.length} updated${skipped ? `, ${skipped} skipped (not ready to ${action})` : ""}`, skipped ? "error" : "success");
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["titles"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const rows = list.data?.results ?? [];
  const total = list.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const writable = can("content_manager");
  const hasFilters = useMemo(() => Object.entries(filters).some(([k, v]) => k !== "page" && v), [filters]);

  return (
    <>
      <PageHeader
        title="Titles"
        description={list.data ? `${total} title${total === 1 ? "" : "s"}` : "Movies and series in the catalog."}
        actions={
          writable && (
            <Link href="/titles/new">
              <Button variant="primary"><Plus className="size-4" /> New title</Button>
            </Link>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <Input value={filters.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search titles…" className="pl-8" aria-label="Search titles" />
        </div>
        <Select value={filters.type} onChange={(e) => set({ type: e.target.value })} aria-label="Type">
          <option value="">All types</option>
          <option value="movie">Movies</option>
          <option value="series">Series</option>
        </Select>
        <Select value={filters.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status">
          <option value="">Any status</option>
          {["draft", "processing", "published", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={filters.translation} onChange={(e) => set({ translation: e.target.value })} aria-label="Translation">
          <option value="">Translated & not</option>
          <option value="translated">Translated</option>
          <option value="not_translated">Not translated</option>
        </Select>
        <Select value={filters.genre} onChange={(e) => set({ genre: e.target.value })} aria-label="Genre">
          <option value="">All genres</option>
          {genres.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ search: "", type: "", status: "", translation: "", genre: "", page: 1 })}>
            Clear
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="border-b border-line bg-raised/50 text-[12px] text-muted">
              <tr>
                <th className="w-10 px-3 py-2">
                  {writable && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                      className="accent-[var(--accent)]"
                    />
                  )}
                </th>
                <th className="px-2 py-2 font-medium">Title</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Translation</th>
                <th className="px-2 py-2 font-medium">Video</th>
                <th className="px-2 py-2 font-medium">Genres</th>
                <th className="px-3 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className={cn("divide-y divide-line transition-opacity", list.isPlaceholderData && "opacity-60")}>
              {list.isPending &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5" colSpan={7}><Skeleton className="h-9 w-full" /></td>
                  </tr>
                ))}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/titles/${row.id}`)}
                  className={cn("cursor-pointer hover:bg-hover", selected.has(row.id) && "bg-accent/5")}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {writable && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.title}`}
                        checked={selected.has(row.id)}
                        onChange={() =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          })
                        }
                        className="accent-[var(--accent)]"
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-3">
                      <Thumb image={row.poster} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">{row.title}</span>
                          {row.is_featured && <Star className="size-3 fill-amber-400 text-amber-400" aria-label="Featured" />}
                        </div>
                        <div className="text-[12px] text-muted">
                          {row.type === "series" ? `Series · ${row.season_count} season${row.season_count === 1 ? "" : "s"} · ${row.episode_count} ep` : "Movie"}
                          {row.year ? ` · ${row.year}` : ""}
                          {row.maturity_rating ? ` · ${row.maturity_rating}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2"><StatusChip status={row.status} /></td>
                  <td className="px-2 py-2"><TranslationChip value={row.translation_status} /></td>
                  <td className="px-2 py-2">{row.type === "movie" ? <VideoChip status={row.video_status} /> : <span className="text-subtle">episodes</span>}</td>
                  <td className="max-w-48 truncate px-2 py-2 text-muted">{row.genres.map((g) => g.name).join(", ") || "—"}</td>
                  <td className="tabular px-3 py-2 text-right text-[12px] text-muted">{new Date(row.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.isPending && rows.length === 0 && (
          <Empty icon={<Clapperboard className="size-8" />} title={hasFilters ? "No titles match these filters" : "No titles yet"}>
            {hasFilters ? "Try clearing a filter." : "Create your first movie or series to get started."}
          </Empty>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12.5px] text-muted">
            <span className="tabular">Page {filters.page} of {pages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))} aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))} aria-label="Next page">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line bg-panel p-1.5 pl-4 shadow-2xl"
          >
            <span className="mr-2 text-[13px] font-medium tabular">{selected.size} selected</span>
            <Button size="sm" variant="primary" loading={bulk.isPending} onClick={() => bulk.mutate("publish")}><Upload className="size-3.5" /> Publish</Button>
            <Button size="sm" onClick={() => bulk.mutate("feature")}><Star className="size-3.5" /> Feature</Button>
            <Button size="sm" onClick={() => bulk.mutate("unfeature")}>Unfeature</Button>
            <Button size="sm" onClick={() => bulk.mutate("draft")}>Move to draft</Button>
            <Button size="sm" onClick={() => bulk.mutate("archive")}><Archive className="size-3.5" /> Archive</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancel</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default function TitlesPage() {
  return (
    <Suspense>
      <TitlesTable />
    </Suspense>
  );
}
