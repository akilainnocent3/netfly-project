"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, GripVertical, Home, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ImageSlot } from "@/components/catalog/editor/image-slot";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Empty, Input, PageHeader, Skeleton, Switch } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { GenreAdmin } from "@/lib/types";

export default function CategoriesPage() {
  const toast = useToast();
  const { can } = useAuth();
  const readOnly = !can("content_manager");
  const queryClient = useQueryClient();
  const genres = useQuery({ queryKey: ["genres"], queryFn: () => unwrap(api.GET("/api/v1/admin/genres")) });
  const [order, setOrder] = useState<number[]>([]);
  const [name, setName] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(() => setOrder(genres.data?.map((g) => g.id) ?? []), [genres.data]);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["genres"] });

  const create = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/admin/genres", { body: { name: name.trim() } })),
    onSuccess: () => {
      setName("");
      toast("Genre created");
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : "Couldn't create", "error"),
  });

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(Number(active.id)), order.indexOf(Number(over.id)));
    setOrder(next);
    await unwrap(api.POST("/api/v1/admin/genres/reorder", { body: { ids: next } }));
    toast("Order saved");
    refresh();
  };
  const byId = new Map(genres.data?.map((g) => [g.id, g]));

  return (
    <>
      <PageHeader title="Categories & genres" description="Drag to set the order viewers see. Genres marked “Home row” get their own row on the home page." />
      {!readOnly && (
        <form
          className="mb-4 flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New genre name" aria-label="New genre name" />
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}><Plus className="size-4" /> Add</Button>
        </form>
      )}
      {genres.isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : order.length === 0 ? (
        <Card><Empty icon={<FolderTree className="size-8" />} title="No genres yet">Add genres like Action, Drama or Comedy.</Empty></Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {order.map((id) => {
                const genre = byId.get(id);
                return genre ? <GenreCard key={id} genre={genre} readOnly={readOnly} refresh={refresh} /> : null;
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}

function GenreCard({ genre, readOnly, refresh }: { genre: GenreAdmin; readOnly: boolean; refresh: () => void }) {
  const toast = useToast();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: genre.id, disabled: readOnly });
  const save = async (patch: Partial<GenreAdmin> & { artwork_id?: string | null }) => {
    try {
      await unwrap(api.PATCH("/api/v1/admin/genres/{id}", { params: { path: { id: genre.id } }, body: patch }));
      toast("Saved");
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Save failed", "error");
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${genre.name}”? Titles keep their other genres.`)) return;
    await unwrap(api.DELETE("/api/v1/admin/genres/{id}", { params: { path: { id: genre.id } } }));
    refresh();
  };
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "z-10")}>
      <Card className={cn("p-3", isDragging && "shadow-xl")}>
        <div className="mb-2 flex items-center gap-2">
          {!readOnly && (
            <button type="button" className="cursor-grab touch-none rounded p-0.5 text-subtle hover:text-fg" aria-label={`Drag ${genre.name}`} {...attributes} {...listeners}>
              <GripVertical className="size-4" />
            </button>
          )}
          <Input
            defaultValue={genre.name}
            disabled={readOnly}
            aria-label="Genre name"
            className="h-7 border-transparent bg-transparent px-1 font-medium hover:border-line"
            onBlur={(e) => e.target.value.trim() && e.target.value !== genre.name && void save({ name: e.target.value.trim() })}
          />
          <span className="shrink-0 tabular text-[12px] text-subtle">{genre.title_count} titles</span>
        </div>
        <ImageSlot kind="artwork" label="Artwork" image={genre.artwork} disabled={readOnly} onAttach={(id) => save({ artwork_id: id })} />
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-[12.5px]">
            <Switch checked={genre.show_on_home ?? false} disabled={readOnly} onCheckedChange={(v) => void save({ show_on_home: v })} label="Show as home row" />
            <Home className="size-3.5 text-subtle" /> Home row
          </label>
          {!readOnly && (
            <Button size="sm" variant="ghost" aria-label={`Delete ${genre.name}`} onClick={() => void remove()}><Trash2 className="size-3.5" /></Button>
          )}
        </div>
      </Card>
    </div>
  );
}
