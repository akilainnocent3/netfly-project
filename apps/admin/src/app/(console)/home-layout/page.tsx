"use client";

import { unwrap, type Schemas } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BoostedPanel } from "@/components/catalog/boosted-panel";
import { Thumb } from "@/components/catalog/thumb";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { IconButton, useAction, useConfirm } from "@/components/ui/actions";
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

type HomeRow = Schemas["HomeRowAdmin"];
type Kind = Schemas["HomeRowKindEnum"];

const KIND_LABEL: Record<Kind, string> = {
  continue_watching: "Continue Watching",
  because_you_liked: "Because you liked… (personal)",
  top_picks: "Top picks for you (personal)",
  trending: "Trending now",
  top10: "Top 10",
  new_releases: "New releases",
  my_list: "My List",
  collection: "Curated collection",
  genre: "Genre",
  home_genres: "All 'home row' genres",
};

function useSortList<T extends { id: number }>(
  items: T[] | undefined,
  reorder: (ids: number[]) => Promise<unknown>,
) {
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => {
    setOrder(items?.map((i) => i.id) ?? []);
  }, [items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(order, order.indexOf(Number(active.id)), order.indexOf(Number(over.id)));
    setOrder(next);
    const ok = await reorder(next);
    if (ok === undefined) setOrder(previous); // failed: roll back the optimistic order
  };
  const byId = new Map(items?.map((i) => [i.id, i]));
  return { order, sensors, onDragEnd, byId };
}

function DragHandle(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="text-subtle hover:text-fg cursor-grab touch-none p-1"
      aria-label="Drag to reorder"
      {...props}
    >
      <GripVertical className="size-4" />
    </button>
  );
}

export default function HomeLayoutPage() {
  const { can } = useAuth();
  const readOnly = !can("content_manager");
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: ["home-rows"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/home-rows")),
  });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/collections")),
  });
  const genres = useQuery({
    queryKey: ["genres"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/genres")),
  });
  const [previewKey, setPreviewKey] = useState(0);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["home-rows"] });
    setPreviewKey((k) => k + 1);
  };
  const reorder = useAction(
    async (ids: number[]) => {
      await unwrap(api.POST("/api/v1/admin/home-rows/reorder", { body: { ids } }));
      refresh();
      return true;
    },
    { success: "Row order saved" },
  );
  const list = useSortList(rows.data, reorder.run);
  const [kind, setKind] = useState<Kind>("trending");
  const [target, setTarget] = useState("");

  const add = useAction(
    async () => {
      await unwrap(
        api.POST("/api/v1/admin/home-rows", {
          body: {
            kind,
            collection: kind === "collection" ? Number(target) : null,
            genre: kind === "genre" ? Number(target) : null,
            is_active: true,
          },
        }),
      );
      refresh();
    },
    { success: "Row added" },
  );

  return (
    <>
      <PageHeader
        title="Home layout"
        description="Drag rows into the order viewers see. Personal rows adapt to each viewer; the feed keeps going with more genres below."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="space-y-5">
          <BoostedPanel readOnly={readOnly} />
          <Card>
            <div className="border-line border-b px-4 py-3 font-medium">Rows</div>
            {rows.isPending ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : (
              <DndContext
                sensors={list.sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => void list.onDragEnd(e)}
              >
                <SortableContext items={list.order} strategy={verticalListSortingStrategy}>
                  <ul className="divide-line divide-y">
                    {list.order.map((id) => {
                      const row = list.byId.get(id);
                      return row ? (
                        <RowItem key={id} row={row} readOnly={readOnly} refresh={refresh} />
                      ) : null;
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
            {rows.data?.length === 0 && (
              <Empty title="Using the default layout">Add rows to take control of the order.</Empty>
            )}
            {!readOnly && (
              <div className="border-line flex flex-wrap items-end gap-2 border-t p-4">
                <div>
                  <Label>Add a row</Label>
                  <Select
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value as Kind);
                      setTarget("");
                    }}
                  >
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </Select>
                </div>
                {kind === "collection" && (
                  <Select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    aria-label="Collection"
                  >
                    <option value="">Choose collection…</option>
                    {collections.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
                {kind === "genre" && (
                  <Select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    aria-label="Genre"
                  >
                    <option value="">Choose genre…</option>
                    {genres.data?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                )}
                <Button
                  variant="primary"
                  loading={add.pending}
                  onClick={() => void add.run()}
                  disabled={(kind === "collection" || kind === "genre") && !target}
                >
                  <Plus className="size-4" /> Add
                </Button>
              </div>
            )}
          </Card>
          <Billboards readOnly={readOnly} onChange={() => setPreviewKey((k) => k + 1)} />
          <Collections readOnly={readOnly} onChange={() => setPreviewKey((k) => k + 1)} />
        </div>
        <LivePreview key={previewKey} />
      </div>
    </>
  );
}

function RowItem({
  row,
  readOnly,
  refresh,
}: {
  row: HomeRow;
  readOnly: boolean;
  refresh: () => void;
}) {
  const confirm = useConfirm();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: readOnly,
  });
  const patch = useAction(
    async (body: Partial<HomeRow>) => {
      await unwrap(
        api.PATCH("/api/v1/admin/home-rows/{id}", { params: { path: { id: row.id } }, body }),
      );
      refresh();
    },
    { success: "Saved ✓" },
  );
  const name = row.title || row.collection_name || row.genre_name || KIND_LABEL[row.kind];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-panel flex items-center gap-3 px-3 py-2",
        isDragging && "relative z-10 shadow-lg",
        !row.is_active && "opacity-50",
      )}
    >
      {!readOnly && <DragHandle {...attributes} {...listeners} />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <p className="text-muted text-[12px]">
          {KIND_LABEL[row.kind]}
          {row.collection_name ? ` · ${row.collection_name}` : ""}
          {row.genre_name ? ` · ${row.genre_name}` : ""}
        </p>
      </div>
      {!readOnly && (
        <>
          <div className="hidden w-44 shrink-0 md:block">
            <Input
              defaultValue={row.title ?? ""}
              placeholder="Custom heading"
              aria-label="Custom heading"
              disabled={patch.pending}
              onBlur={(e) =>
                e.target.value !== (row.title ?? "") && void patch.run({ title: e.target.value })
              }
            />
          </div>
          <IconButton
            label={row.is_active ? "Hide row" : "Show row"}
            loading={patch.pending}
            onClick={() => void patch.run({ is_active: !row.is_active })}
          >
            {row.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </IconButton>
          <IconButton
            label="Remove row"
            tone="danger"
            onClick={() =>
              confirm({
                title: `Remove “${name}” from the home page?`,
                body: "Viewers stop seeing this row immediately. You can add it again later.",
                confirmLabel: "Remove row",
                destructive: true,
                success: "Row removed",
                action: async () => {
                  await unwrap(
                    api.DELETE("/api/v1/admin/home-rows/{id}", {
                      params: { path: { id: row.id } },
                    }),
                  );
                  refresh();
                },
              })
            }
          >
            <Trash2 className="size-4" />
          </IconButton>
        </>
      )}
    </li>
  );
}

function TitleSearch({
  onPick,
  placeholder,
  busy,
}: {
  onPick: (t: Schemas["RelatedBrief"]) => Promise<unknown>;
  placeholder: string;
  busy?: boolean;
}) {
  const [q, setQ] = useState("");
  const query = useDebounced(q, 200);
  const results = useQuery({
    queryKey: ["picker", query],
    enabled: query.length > 0,
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/title-picker", { params: { query: { q: query } } })),
  });
  return (
    <div className="relative">
      <Search className="text-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <Input
        className="pl-8"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={placeholder}
      />
      {q && results.data && (
        <ul className="border-line bg-panel absolute inset-x-0 top-9 z-20 max-h-64 overflow-y-auto rounded-md border p-1 shadow-xl">
          {results.data.map((t) => (
            <li key={t.id}>
              <Button
                variant="ghost"
                className="text-fg h-auto w-full justify-start gap-2 px-2 py-1.5 text-left"
                disabled={busy}
                onClick={async () => {
                  await onPick(t);
                  setQ("");
                }}
              >
                <Thumb image={t.poster} className="w-6" />{" "}
                <span className="truncate">{t.title}</span>
                {t.status !== "published" && <Badge className="ml-auto">{t.status}</Badge>}
              </Button>
            </li>
          ))}
          {results.data.length === 0 && <li className="text-muted px-2 py-1.5">No titles</li>}
        </ul>
      )}
    </div>
  );
}

function Billboards({ readOnly, onChange }: { readOnly: boolean; onChange: () => void }) {
  const queryClient = useQueryClient();
  const billboards = useQuery({
    queryKey: ["billboards"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/billboards")),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["billboards"] });
    onChange();
  };
  const reorder = useAction(
    async (ids: number[]) => {
      await unwrap(api.POST("/api/v1/admin/billboards/reorder", { body: { ids } }));
      refresh();
      return true;
    },
    { success: "Billboard order saved" },
  );
  const add = useAction(
    async (t: Schemas["RelatedBrief"]) => {
      await unwrap(api.POST("/api/v1/admin/billboards", { body: { title: t.id } }));
      refresh();
      return t.title;
    },
    { success: (name) => `${name} added to the billboard` },
  );
  const list = useSortList(billboards.data, reorder.run);
  return (
    <Card>
      <div className="border-line border-b px-4 py-3">
        <p className="font-medium">Hero billboard</p>
        <p className="text-muted text-[12.5px]">
          Rotates in this order, topped up with boosted and featured titles. Leave empty to feature
          titles automatically.
        </p>
      </div>
      <DndContext
        sensors={list.sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void list.onDragEnd(e)}
      >
        <SortableContext items={list.order} strategy={verticalListSortingStrategy}>
          <ul className="divide-line divide-y">
            {list.order.map((id) => {
              const b = list.byId.get(id);
              return b ? (
                <BillboardItem key={id} item={b} readOnly={readOnly} refresh={refresh} />
              ) : null;
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {!readOnly && (
        <div className="border-line border-t p-4">
          <TitleSearch
            placeholder="Add a title to the billboard…"
            busy={add.pending}
            onPick={add.run}
          />
        </div>
      )}
    </Card>
  );
}

function BillboardItem({
  item,
  readOnly,
  refresh,
}: {
  item: Schemas["BillboardAdmin"];
  readOnly: boolean;
  refresh: () => void;
}) {
  const confirm = useConfirm();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    disabled: readOnly,
  });
  const patch = useAction(
    async (body: Partial<Schemas["BillboardAdmin"]>) => {
      await unwrap(
        api.PATCH("/api/v1/admin/billboards/{id}", { params: { path: { id: item.id } }, body }),
      );
      refresh();
    },
    { success: "Saved ✓" },
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="bg-panel flex items-center gap-3 px-3 py-2"
    >
      {!readOnly && <DragHandle {...attributes} {...listeners} />}
      <Thumb image={item.title_detail.poster} />
      <span className="min-w-0 flex-1 truncate font-medium">{item.title_detail.title}</span>
      {!readOnly && (
        <>
          <div className="hidden w-40 shrink-0 md:block">
            <Input
              defaultValue={item.headline ?? ""}
              placeholder="Headline (optional)"
              aria-label="Headline"
              disabled={patch.pending}
              onBlur={(e) =>
                e.target.value !== (item.headline ?? "") &&
                void patch.run({ headline: e.target.value })
              }
            />
          </div>
          <IconButton
            label={item.is_active ? "Pause" : "Activate"}
            loading={patch.pending}
            onClick={() => void patch.run({ is_active: !item.is_active })}
          >
            {item.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </IconButton>
          <IconButton
            label="Remove from billboard"
            tone="danger"
            onClick={() =>
              confirm({
                title: `Remove “${item.title_detail.title}” from the billboard?`,
                confirmLabel: "Remove",
                destructive: true,
                success: "Removed from the billboard",
                action: async () => {
                  await unwrap(
                    api.DELETE("/api/v1/admin/billboards/{id}", {
                      params: { path: { id: item.id } },
                    }),
                  );
                  refresh();
                },
              })
            }
          >
            <Trash2 className="size-4" />
          </IconButton>
        </>
      )}
    </li>
  );
}

function Collections({ readOnly, onChange }: { readOnly: boolean; onChange: () => void }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/collections")),
  });
  const [name, setName] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
    onChange();
  };
  const save = useAction(
    async (c: Schemas["CollectionAdmin"], ids: number[]) => {
      await unwrap(
        api.PATCH("/api/v1/admin/collections/{id}", {
          params: { path: { id: c.id } },
          body: { title_ids: ids },
        }),
      );
      refresh();
    },
    { success: "Collection saved" },
  );
  const create = useAction(
    async () => {
      await unwrap(api.POST("/api/v1/admin/collections", { body: { name: name.trim() } }));
      setName("");
      refresh();
    },
    { success: "Collection created" },
  );
  return (
    <Card>
      <div className="border-line border-b px-4 py-3">
        <p className="font-medium">Curated collections</p>
        <p className="text-muted text-[12.5px]">
          Hand-picked rows like “Trending Now” or “New on NETFLY”, with an optional schedule.
        </p>
      </div>
      <ul className="divide-line divide-y">
        {collections.data?.map((c) => (
          <li key={c.id} className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.name}</span>
              <Badge tone={c.is_active ? "green" : "neutral"}>{c.is_active ? "live" : "off"}</Badge>
              {(c.starts_at || c.ends_at) && (
                <span className="text-muted text-[12px]">
                  {c.starts_at ? new Date(c.starts_at).toLocaleDateString() : "now"} →{" "}
                  {c.ends_at ? new Date(c.ends_at).toLocaleDateString() : "open"}
                </span>
              )}
              {!readOnly && (
                <IconButton
                  label="Delete collection"
                  tone="danger"
                  className="ml-auto"
                  onClick={() =>
                    confirm({
                      title: `Delete the “${c.name}” collection?`,
                      body: "Any home row that shows it disappears too. Titles are not affected.",
                      confirmLabel: "Delete collection",
                      destructive: true,
                      success: "Collection deleted",
                      action: async () => {
                        await unwrap(
                          api.DELETE("/api/v1/admin/collections/{id}", {
                            params: { path: { id: c.id } },
                          }),
                        );
                        refresh();
                      },
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.items.map((item) => (
                <span
                  key={item.id}
                  className="border-line bg-raised inline-flex items-center gap-1.5 rounded-md border py-0.5 pr-0.5 pl-0.5 text-[12.5px]"
                >
                  <Thumb image={item.title.poster} className="w-5" /> {item.title.title}
                  {!readOnly && (
                    <IconButton
                      size="sm"
                      tone="danger"
                      label={`Remove ${item.title.title}`}
                      disabled={save.pending}
                      onClick={() =>
                        void save.run(
                          c,
                          c.items.filter((i) => i.id !== item.id).map((i) => i.title.id),
                        )
                      }
                    >
                      <X className="size-3" />
                    </IconButton>
                  )}
                </span>
              ))}
            </div>
            {!readOnly && (
              <TitleSearch
                placeholder={`Add to ${c.name}…`}
                busy={save.pending}
                onPick={(t) => save.run(c, [...c.items.map((i) => i.title.id), t.id])}
              />
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form
          className="border-line flex gap-2 border-t p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void create.run();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collection name"
            aria-label="New collection name"
          />
          <Button type="submit" loading={create.pending} disabled={!name.trim()}>
            <Plus className="size-4" /> Create
          </Button>
        </form>
      )}
    </Card>
  );
}

/** Sketch of the viewer home in layout order (personal rows vary per viewer). */
function LivePreview() {
  const config = useConfig();
  const clientUrl = config
    .str("content.client_app_url", "http://localhost:3000")
    .replace(/\/$/, "");
  const rows = useQuery({
    queryKey: ["home-rows"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/home-rows")),
  });
  const billboards = useQuery({
    queryKey: ["billboards"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/billboards")),
  });
  const hero = billboards.data?.find((b) => b.is_active);
  return (
    <div className="xl:sticky xl:top-16 xl:self-start">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-muted text-[12.5px] font-medium">Live preview</p>
        <a
          href={`${clientUrl}/browse`}
          target="_blank"
          rel="noreferrer"
          className="text-accent text-[12.5px] hover:underline"
        >
          Open viewer app ↗
        </a>
      </div>
      <div className="border-line overflow-hidden rounded-xl border bg-[#141414] text-white shadow-lg">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-[#2a1416] to-[#141414]">
          {hero && (
            <div className="absolute inset-0 opacity-70">
              <Thumb
                image={hero.title_detail.poster}
                className="!absolute inset-0 !w-full !rounded-none"
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4">
            <p className="text-[12px] tracking-widest text-white/60 uppercase">Billboard</p>
            <p className="text-[18px] font-black uppercase">
              {hero?.title_detail.title ?? "Auto-featured"}
            </p>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {(rows.data?.length ? rows.data.filter((r) => r.is_active) : []).map((r) => (
            <div key={r.id}>
              <p className="mb-1.5 text-[12px] font-bold">
                {r.title ||
                  r.collection_name ||
                  r.genre_name ||
                  KIND_LABEL[r.kind].replace(/ \(personal\)/, "")}
              </p>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-video flex-1 rounded bg-white/10" />
                ))}
                <div className="aspect-video w-6 rounded-l bg-white/5" />
              </div>
            </div>
          ))}
          {rows.data?.length === 0 && (
            <p className="text-[12px] text-white/50">
              Default layout: Continue Watching, Because you liked…, Top picks, Trending, Top 10,
              New releases, collections, genres, My List.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
