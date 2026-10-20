"use client";

import { ApiError, unwrap, type Schemas } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, GripVertical, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Thumb } from "@/components/catalog/thumb";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { useToast } from "@/components/providers/toast";
import { Badge, Button, Card, Empty, Input, Label, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
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

function useSortList<T extends { id: number }>(items: T[] | undefined, reorder: (ids: number[]) => Promise<void>) {
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => setOrder(items?.map((i) => i.id) ?? []), [items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(Number(active.id)), order.indexOf(Number(over.id)));
    setOrder(next);
    await reorder(next);
  };
  const byId = new Map(items?.map((i) => [i.id, i]));
  return { order, sensors, onDragEnd, byId };
}

export default function HomeLayoutPage() {
  const toast = useToast();
  const { can } = useAuth();
  const readOnly = !can("content_manager");
  const queryClient = useQueryClient();
  const rows = useQuery({ queryKey: ["home-rows"], queryFn: () => unwrap(api.GET("/api/v1/admin/home-rows")) });
  const collections = useQuery({ queryKey: ["collections"], queryFn: () => unwrap(api.GET("/api/v1/admin/collections")) });
  const genres = useQuery({ queryKey: ["genres"], queryFn: () => unwrap(api.GET("/api/v1/admin/genres")) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["home-rows"] });
    setPreviewKey((k) => k + 1);
  };
  const [previewKey, setPreviewKey] = useState(0);
  const list = useSortList(rows.data, async (ids) => {
    await unwrap(api.POST("/api/v1/admin/home-rows/reorder", { body: { ids } }));
    toast("Row order saved");
    refresh();
  });
  const [kind, setKind] = useState<Kind>("trending");
  const [target, setTarget] = useState("");

  const add = async () => {
    try {
      await unwrap(api.POST("/api/v1/admin/home-rows", {
        body: { kind, collection: kind === "collection" ? Number(target) : null, genre: kind === "genre" ? Number(target) : null, is_active: true },
      }));
      toast("Row added");
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : "Couldn't add", "error");
    }
  };
  const patch = async (row: HomeRow, body: Partial<HomeRow>) => {
    await unwrap(api.PATCH("/api/v1/admin/home-rows/{id}", { params: { path: { id: row.id } }, body }));
    toast("Saved ✓");
    refresh();
  };
  const remove = async (row: HomeRow) => {
    await unwrap(api.DELETE("/api/v1/admin/home-rows/{id}", { params: { path: { id: row.id } } }));
    refresh();
  };

  return (
    <>
      <PageHeader title="Home layout" description="Drag rows into the order viewers see. Personal rows adapt to each viewer; the feed keeps going with more genres below." />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="space-y-5">
          <Card>
            <div className="border-b border-line px-4 py-3 font-medium">Rows</div>
            {rows.isPending ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div> : (
              <DndContext sensors={list.sensors} collisionDetection={closestCenter} onDragEnd={(e) => void list.onDragEnd(e)}>
                <SortableContext items={list.order} strategy={verticalListSortingStrategy}>
                  <ul className="divide-y divide-line">
                    {list.order.map((id) => {
                      const row = list.byId.get(id);
                      return row ? <RowItem key={id} row={row} readOnly={readOnly} onPatch={(b) => void patch(row, b)} onRemove={() => void remove(row)} /> : null;
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
            {rows.data?.length === 0 && <Empty title="Using the default layout">Add rows to take control of the order.</Empty>}
            {!readOnly && (
              <div className="flex flex-wrap items-end gap-2 border-t border-line p-4">
                <div>
                  <Label>Add a row</Label>
                  <Select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setTarget(""); }}>
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </Select>
                </div>
                {kind === "collection" && (
                  <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Collection">
                    <option value="">Choose collection…</option>
                    {collections.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                )}
                {kind === "genre" && (
                  <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Genre">
                    <option value="">Choose genre…</option>
                    {genres.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                )}
                <Button variant="primary" onClick={() => void add()} disabled={(kind === "collection" || kind === "genre") && !target}><Plus className="size-4" /> Add</Button>
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

function RowItem({ row, readOnly, onPatch, onRemove }: { row: HomeRow; readOnly: boolean; onPatch: (b: Partial<HomeRow>) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: readOnly });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex items-center gap-3 bg-panel px-3 py-2", isDragging && "relative z-10 shadow-lg", !row.is_active && "opacity-50")}>
      {!readOnly && <button type="button" className="cursor-grab touch-none p-1 text-subtle hover:text-fg" aria-label="Drag to reorder" {...attributes} {...listeners}><GripVertical className="size-4" /></button>}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.title || row.collection_name || row.genre_name || KIND_LABEL[row.kind]}</p>
        <p className="text-[12px] text-muted">{KIND_LABEL[row.kind]}{row.collection_name ? ` · ${row.collection_name}` : ""}{row.genre_name ? ` · ${row.genre_name}` : ""}</p>
      </div>
      {!readOnly && (
        <>
          <div className="hidden w-44 shrink-0 md:block"><Input defaultValue={row.title ?? ""} placeholder="Custom heading" aria-label="Custom heading" onBlur={(e) => e.target.value !== (row.title ?? "") && onPatch({ title: e.target.value })} /></div>
          <Button size="sm" variant="ghost" aria-label={row.is_active ? "Hide row" : "Show row"} onClick={() => onPatch({ is_active: !row.is_active })}>{row.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Button>
          <Button size="sm" variant="ghost" aria-label="Remove row" onClick={onRemove}><Trash2 className="size-4" /></Button>
        </>
      )}
    </li>
  );
}

function TitleSearch({ onPick, placeholder }: { onPick: (t: Schemas["RelatedBrief"]) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q, 200);
  const results = useQuery({ queryKey: ["picker", query], enabled: query.length > 0, queryFn: () => unwrap(api.GET("/api/v1/admin/title-picker", { params: { query: { q: query } } })) });
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
      <Input className="pl-8" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={placeholder} />
      {q && results.data && (
        <ul className="absolute inset-x-0 top-9 z-20 max-h-64 overflow-y-auto rounded-md border border-line bg-panel p-1 shadow-xl">
          {results.data.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => { onPick(t); setQ(""); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover">
                <Thumb image={t.poster} className="w-6" /> <span className="truncate">{t.title}</span>
                {t.status !== "published" && <Badge className="ml-auto">{t.status}</Badge>}
              </button>
            </li>
          ))}
          {results.data.length === 0 && <li className="px-2 py-1.5 text-muted">No titles</li>}
        </ul>
      )}
    </div>
  );
}

function Billboards({ readOnly, onChange }: { readOnly: boolean; onChange: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const billboards = useQuery({ queryKey: ["billboards"], queryFn: () => unwrap(api.GET("/api/v1/admin/billboards")) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["billboards"] });
    onChange();
  };
  const list = useSortList(billboards.data, async (ids) => {
    await unwrap(api.POST("/api/v1/admin/billboards/reorder", { body: { ids } }));
    toast("Billboard order saved");
    refresh();
  });
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <p className="font-medium">Hero billboard</p>
        <p className="text-[12.5px] text-muted">Rotates in this order. Leave empty to feature titles automatically.</p>
      </div>
      <DndContext sensors={list.sensors} collisionDetection={closestCenter} onDragEnd={(e) => void list.onDragEnd(e)}>
        <SortableContext items={list.order} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-line">
            {list.order.map((id) => {
              const b = list.byId.get(id);
              return b ? <BillboardItem key={id} item={b} readOnly={readOnly} refresh={refresh} /> : null;
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {!readOnly && (
        <div className="border-t border-line p-4">
          <TitleSearch placeholder="Add a title to the billboard…" onPick={async (t) => { await unwrap(api.POST("/api/v1/admin/billboards", { body: { title: t.id } })); refresh(); }} />
        </div>
      )}
    </Card>
  );
}

function BillboardItem({ item, readOnly, refresh }: { item: Schemas["BillboardAdmin"]; readOnly: boolean; refresh: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled: readOnly });
  const patch = async (body: Partial<Schemas["BillboardAdmin"]>) => {
    await unwrap(api.PATCH("/api/v1/admin/billboards/{id}", { params: { path: { id: item.id } }, body }));
    refresh();
  };
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex items-center gap-3 bg-panel px-3 py-2">
      {!readOnly && <button type="button" className="cursor-grab touch-none p-1 text-subtle" aria-label="Drag to reorder" {...attributes} {...listeners}><GripVertical className="size-4" /></button>}
      <Thumb image={item.title_detail.poster} />
      <span className="min-w-0 flex-1 truncate font-medium">{item.title_detail.title}</span>
      {!readOnly && (
        <>
          <div className="hidden w-40 shrink-0 md:block"><Input defaultValue={item.headline ?? ""} placeholder="Headline (optional)" aria-label="Headline" onBlur={(e) => e.target.value !== (item.headline ?? "") && void patch({ headline: e.target.value })} /></div>
          <Button size="sm" variant="ghost" aria-label={item.is_active ? "Pause" : "Activate"} onClick={() => void patch({ is_active: !item.is_active })}>{item.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Button>
          <Button size="sm" variant="ghost" aria-label="Remove" onClick={async () => { await unwrap(api.DELETE("/api/v1/admin/billboards/{id}", { params: { path: { id: item.id } } })); refresh(); }}><Trash2 className="size-4" /></Button>
        </>
      )}
    </li>
  );
}

function Collections({ readOnly, onChange }: { readOnly: boolean; onChange: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const collections = useQuery({ queryKey: ["collections"], queryFn: () => unwrap(api.GET("/api/v1/admin/collections")) });
  const [name, setName] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
    onChange();
  };
  const save = async (c: Schemas["CollectionAdmin"], ids: number[]) => {
    await unwrap(api.PATCH("/api/v1/admin/collections/{id}", { params: { path: { id: c.id } }, body: { title_ids: ids } }));
    toast("Collection saved");
    refresh();
  };
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <p className="font-medium">Curated collections</p>
        <p className="text-[12.5px] text-muted">Hand-picked rows like “Trending Now” or “New on NETFLY”, with an optional schedule.</p>
      </div>
      <ul className="divide-y divide-line">
        {collections.data?.map((c) => (
          <li key={c.id} className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.name}</span>
              <Badge tone={c.is_active ? "green" : "neutral"}>{c.is_active ? "live" : "off"}</Badge>
              {(c.starts_at || c.ends_at) && <span className="text-[12px] text-muted">{c.starts_at ? new Date(c.starts_at).toLocaleDateString() : "now"} → {c.ends_at ? new Date(c.ends_at).toLocaleDateString() : "open"}</span>}
              {!readOnly && <Button size="sm" variant="ghost" className="ml-auto" aria-label="Delete collection" onClick={async () => { await unwrap(api.DELETE("/api/v1/admin/collections/{id}", { params: { path: { id: c.id } } })); refresh(); }}><Trash2 className="size-4" /></Button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.items.map((item) => (
                <span key={item.id} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised py-0.5 pl-0.5 pr-2 text-[12.5px]">
                  <Thumb image={item.title.poster} className="w-5" /> {item.title.title}
                  {!readOnly && <button type="button" aria-label={`Remove ${item.title.title}`} className="text-subtle hover:text-red-500" onClick={() => void save(c, c.items.filter((i) => i.id !== item.id).map((i) => i.title.id))}>×</button>}
                </span>
              ))}
            </div>
            {!readOnly && <TitleSearch placeholder={`Add to ${c.name}…`} onPick={(t) => void save(c, [...c.items.map((i) => i.title.id), t.id])} />}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form className="flex gap-2 border-t border-line p-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await unwrap(api.POST("/api/v1/admin/collections", { body: { name: name.trim() } }));
          setName("");
          refresh();
        }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection name" aria-label="New collection name" />
          <Button type="submit" disabled={!name.trim()}><Plus className="size-4" /> Create</Button>
        </form>
      )}
    </Card>
  );
}

/** The real viewer home, as a new viewer sees it, in an iframe-free preview using the public billboard + layout. */
function LivePreview() {
  const config = useConfig();
  const clientUrl = config.str("content.client_app_url", "http://localhost:3000").replace(/\/$/, "");
  const rows = useQuery({ queryKey: ["home-rows"], queryFn: () => unwrap(api.GET("/api/v1/admin/home-rows")) });
  const billboards = useQuery({ queryKey: ["billboards"], queryFn: () => unwrap(api.GET("/api/v1/admin/billboards")) });
  const hero = billboards.data?.find((b) => b.is_active);
  return (
    <div className="xl:sticky xl:top-16 xl:self-start">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-muted">Live preview</p>
        <a href={`${clientUrl}/browse`} target="_blank" rel="noreferrer" className="text-[12.5px] text-accent hover:underline">Open viewer app ↗</a>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-[#0b0b0f] text-white shadow-lg">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-[#2a1a22] to-[#0b0b0f]">
          {hero && <div className="absolute inset-0 opacity-70"><Thumb image={hero.title_detail.poster} className="!absolute inset-0 !w-full !rounded-none" /></div>}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0f] via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4">
            <p className="text-[11px] uppercase tracking-widest text-white/60">Billboard</p>
            <p className="text-[18px] font-black uppercase">{hero?.title_detail.title ?? "Auto-featured"}</p>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {(rows.data?.length ? rows.data.filter((r) => r.is_active) : []).map((r) => (
            <div key={r.id}>
              <p className="mb-1.5 text-[12px] font-bold">{r.title || r.collection_name || r.genre_name || KIND_LABEL[r.kind].replace(/ \(personal\)/, "")}</p>
              <div className="flex gap-1.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="aspect-video flex-1 rounded bg-white/10" />)}<div className="aspect-video w-6 rounded-l bg-white/5" /></div>
            </div>
          ))}
          {rows.data?.length === 0 && <p className="text-[12px] text-white/50">Default layout: Continue Watching, Because you liked…, Top picks, Trending, Top 10, New releases, collections, genres, My List.</p>}
        </div>
      </div>
    </div>
  );
}
