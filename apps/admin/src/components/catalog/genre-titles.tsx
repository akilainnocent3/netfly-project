"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn, LazyLogoLoader } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Film, Plus, Search, Tv, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/providers/toast";
import { IconButton } from "@/components/ui/actions";
import { Button, Empty, Input, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import type { Schemas } from "@netfly/api-client";
import { Thumb } from "./thumb";

type Brief = Schemas["RelatedBrief"];

function Meta({ title }: { title: Brief }) {
  const Icon = title.type === "series" ? Tv : Film;
  return (
    <span className="text-muted flex items-center gap-1 text-[12px]">
      <Icon className="size-3" aria-hidden />
      {title.type === "series" ? "Series" : "Film"}
      {title.year ? ` · ${title.year}` : ""}
      {title.status !== "published" && ` · ${title.status}`}
    </span>
  );
}

/** Studio → Categories → a category: the titles in it, removable, plus “Add titles”. */
export function GenreTitlesDialog({
  genreId,
  genreName,
  readOnly,
  open,
  onOpenChange,
  onChanged,
}: {
  genreId: number;
  genreName: string;
  readOnly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const key = ["genre-titles", genreId];
  const titles = useQuery({
    queryKey: key,
    enabled: open,
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/genres/{id}/titles", { params: { path: { id: genreId } } })),
  });

  const change = async (body: { add?: number[]; remove?: number[] }, success: string) => {
    try {
      const data = await unwrap(
        api.POST("/api/v1/admin/genres/{id}/titles", {
          params: { path: { id: genreId } },
          body: { add: body.add ?? [], remove: body.remove ?? [] },
        }),
      );
      queryClient.setQueryData(key, data);
      onChanged();
      toast(success);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save", "error");
    }
  };

  const count = titles.data?.count ?? 0;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="border-line bg-panel fixed top-1/2 left-1/2 z-[151] flex max-h-[88vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-2xl"
        >
          <div className="border-line flex items-center gap-3 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate font-semibold">
                Titles in “{genreName}”
              </Dialog.Title>
              <p className="text-muted text-[12.5px]">
                {titles.isPending
                  ? "Loading…"
                  : `${count} title${count === 1 ? "" : "s"} · most popular first, as viewers see them`}
              </p>
            </div>
            {!readOnly && !picking && (
              <Button variant="primary" size="sm" onClick={() => setPicking(true)}>
                <Plus className="size-3.5" /> Add titles
              </Button>
            )}
            <Dialog.Close asChild>
              <IconButton label="Close">
                <X className="size-4" />
              </IconButton>
            </Dialog.Close>
          </div>
          {picking ? (
            <Picker
              inGenre={new Set(titles.data?.results.map((t) => t.id))}
              onCancel={() => setPicking(false)}
              onAdd={async (ids) => {
                await change(
                  { add: ids },
                  `Added ${ids.length} title${ids.length === 1 ? "" : "s"} to ${genreName}`,
                );
                setPicking(false);
              }}
            />
          ) : titles.isPending ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : count ? (
            <ul className="divide-line min-h-0 flex-1 divide-y overflow-y-auto">
              {titles.data?.results.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                  <Thumb image={t.poster} className="w-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <Meta title={t} />
                  </div>
                  {!readOnly && (
                    <IconButton
                      label={`Remove ${t.title} from ${genreName}`}
                      tone="danger"
                      onClick={() => change({ remove: [t.id] }, `Removed ${t.title}`)}
                    >
                      <X className="size-3.5" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Film className="size-7" />} title="No titles in this category yet">
              {readOnly
                ? "Content managers can add titles here."
                : "Press “Add titles” to put films and series in it."}
            </Empty>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Picker({
  inGenre,
  onAdd,
  onCancel,
}: {
  inGenre: Set<number>;
  onAdd: (ids: number[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const [selected, setSelected] = useState<Map<number, Brief>>(new Map());
  const results = useQuery({
    queryKey: ["picker", query],
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/title-picker", { params: { query: { q: query } } })),
  });
  const toggle = (t: Brief) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(t.id)) next.delete(t.id);
      else next.set(t.id, t);
      return next;
    });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="text-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles to add…"
            className="pl-8"
            aria-label="Search titles to add"
          />
        </div>
      </div>
      <ul
        className="mt-2 min-h-[200px] flex-1 space-y-0.5 overflow-y-auto px-2"
        aria-label="Search results"
        aria-busy={results.isFetching}
      >
        {results.isPending ? (
          <li className="grid place-items-center py-10">
            <LazyLogoLoader size="md" />
          </li>
        ) : results.data?.length ? (
          results.data.map((t) => {
            const already = inGenre.has(t.id);
            const on = selected.has(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={already || on}
                  disabled={already}
                  onClick={() => toggle(t)}
                  className={cn(
                    "hover:bg-raised flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left disabled:opacity-60",
                    on && "bg-accent/10",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border",
                      on || already ? "border-accent bg-accent text-white" : "border-line",
                    )}
                    aria-hidden
                  >
                    {(on || already) && <Check className="size-3" />}
                  </span>
                  <Thumb image={t.poster} className="w-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.title}</span>
                    <Meta title={t} />
                  </span>
                  {already && <span className="text-subtle text-[12px]">already in</span>}
                </button>
              </li>
            );
          })
        ) : (
          <li className="text-muted py-10 text-center text-[13px]">No titles match “{q}”.</li>
        )}
      </ul>
      <div className="border-line flex items-center gap-2 border-t px-4 py-3">
        <span className="text-muted flex-1 text-[12.5px]">
          {selected.size ? `${selected.size} selected` : "Select one or more titles"}
        </span>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!selected.size}
          onClick={() => onAdd([...selected.keys()])}
        >
          Add {selected.size || ""} {selected.size === 1 ? "title" : "titles"}
        </Button>
      </div>
    </div>
  );
}
