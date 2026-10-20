"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, GripVertical, ListVideo, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Empty, Input, Skeleton, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { EpisodeAdmin, SeasonAdmin } from "@/lib/types";
import { VideoChip } from "../status";
import { ImageSlot } from "./image-slot";

export interface EpisodeSlotProps {
  episode: EpisodeAdmin;
  readOnly: boolean;
  onChanged: () => void;
}

/** The Video tab (Phase 3) plugs its per-episode uploader/marker editor in here. */
export type EpisodeVideoRenderer = (props: EpisodeSlotProps) => React.ReactNode;

export function SeasonsTab({
  titleId,
  readOnly,
  renderEpisodeVideo,
  renderSeasonTools,
}: {
  titleId: number;
  readOnly: boolean;
  renderEpisodeVideo?: EpisodeVideoRenderer;
  renderSeasonTools?: (season: SeasonAdmin, refresh: () => void) => React.ReactNode;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["seasons", titleId];
  const seasons = useQuery({ queryKey: key, queryFn: () => unwrap(api.GET("/api/v1/admin/titles/{id}/seasons", { params: { path: { id: titleId } } })) });
  const [activeId, setActiveId] = useState<number | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });

  useEffect(() => {
    if (seasons.data?.length && !seasons.data.some((s) => s.id === activeId)) setActiveId(seasons.data[0]!.id);
  }, [seasons.data, activeId]);

  const addSeason = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/admin/seasons", { params: { query: { title: titleId } }, body: {} })),
    onSuccess: (season) => {
      setActiveId(season.id);
      refresh();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't add season", "error"),
  });
  const deleteSeason = useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE("/api/v1/admin/seasons/{id}", { params: { path: { id } } })),
    onSuccess: refresh,
  });

  if (seasons.isPending) return <Skeleton className="h-64" />;
  const active = seasons.data?.find((s) => s.id === activeId);

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Card className="h-fit p-2">
        <ul className="space-y-0.5">
          {seasons.data?.map((season) => (
            <li key={season.id}>
              <button
                type="button"
                onClick={() => setActiveId(season.id)}
                className={cn("flex h-9 w-full items-center justify-between rounded-md px-2.5 text-left", season.id === activeId ? "bg-hover font-medium" : "text-muted hover:bg-hover")}
              >
                <span>{season.name || `Season ${season.number}`}</span>
                <span className="tabular text-[12px] text-subtle">{season.episodes.length} ep</span>
              </button>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <Button className="mt-1 w-full" variant="ghost" size="sm" loading={addSeason.isPending} onClick={() => addSeason.mutate()}>
            <Plus className="size-3.5" /> Add season
          </Button>
        )}
      </Card>
      {active ? (
        <SeasonPanel
          key={active.id}
          season={active}
          readOnly={readOnly}
          refresh={refresh}
          onDelete={() => {
            if (active.episodes.length === 0 || window.confirm(`Delete ${active.name || `Season ${active.number}`} and its ${active.episodes.length} episodes?`)) {
              deleteSeason.mutate(active.id);
            }
          }}
          renderEpisodeVideo={renderEpisodeVideo}
          tools={renderSeasonTools?.(active, refresh)}
        />
      ) : (
        <Card><Empty icon={<ListVideo className="size-7" />} title="No seasons yet">Add the first season to start adding episodes.</Empty></Card>
      )}
    </div>
  );
}

function SeasonPanel({
  season,
  readOnly,
  refresh,
  onDelete,
  renderEpisodeVideo,
  tools,
}: {
  season: SeasonAdmin;
  readOnly: boolean;
  refresh: () => void;
  onDelete: () => void;
  renderEpisodeVideo?: EpisodeVideoRenderer;
  tools?: React.ReactNode;
}) {
  const toast = useToast();
  const [order, setOrder] = useState(season.episodes.map((e) => e.id));
  const [open, setOpen] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  useEffect(() => setOrder(season.episodes.map((e) => e.id)), [season.episodes]);
  const byId = new Map(season.episodes.map((e) => [e.id, e]));

  const saveSeason = async (patch: { name?: string; synopsis?: string }) => {
    await unwrap(api.PATCH("/api/v1/admin/seasons/{id}", { params: { path: { id: season.id } }, body: patch }));
    toast("Saved");
    refresh();
  };
  const addEpisode = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/admin/seasons/{id}/episodes", { params: { path: { id: season.id } }, body: { name: `Episode ${season.episodes.length + 1}` } })),
    onSuccess: (ep) => {
      setOpen(ep.id);
      refresh();
    },
  });

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(Number(active.id)), order.indexOf(Number(over.id)));
    setOrder(next);
    try {
      await unwrap(api.POST("/api/v1/admin/seasons/{id}/reorder-episodes", { params: { path: { id: season.id } }, body: { ids: next } }));
      toast("Episodes renumbered");
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Reorder failed", "error");
      setOrder(season.episodes.map((x) => x.id));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="grid gap-4 p-4 sm:grid-cols-[1fr_120px]">
        <div className="space-y-3">
          <Input defaultValue={season.name ?? ""} placeholder={`Season ${season.number}`} disabled={readOnly} aria-label="Season name" onBlur={(e) => e.target.value !== (season.name ?? "") && void saveSeason({ name: e.target.value })} />
          <Textarea rows={2} defaultValue={season.synopsis ?? ""} placeholder="Season synopsis (optional)" disabled={readOnly} aria-label="Season synopsis" onBlur={(e) => e.target.value !== (season.synopsis ?? "") && void saveSeason({ synopsis: e.target.value })} />
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={addEpisode.isPending} onClick={() => addEpisode.mutate()}><Plus className="size-3.5" /> Add episode</Button>
              {tools}
              <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="size-3.5" /> Delete season</Button>
            </div>
          )}
        </div>
        <ImageSlot
          kind="poster"
          label="Season poster"
          image={season.poster}
          disabled={readOnly}
          onAttach={async (id) => {
            await unwrap(api.PATCH("/api/v1/admin/seasons/{id}", { params: { path: { id: season.id } }, body: { poster_id: id } }));
            refresh();
          }}
        />
      </Card>
      <Card>
        {order.length === 0 ? (
          <Empty icon={<ListVideo className="size-7" />} title="No episodes in this season">Add episodes one by one, or bulk-upload video files from the Video tab.</Empty>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-line">
                {order.map((id, index) => {
                  const episode = byId.get(id);
                  return episode ? (
                    <EpisodeRow
                      key={id}
                      episode={episode}
                      displayNumber={index + 1}
                      open={open === id}
                      onToggle={() => setOpen(open === id ? null : id)}
                      readOnly={readOnly}
                      refresh={refresh}
                      renderVideo={renderEpisodeVideo}
                    />
                  ) : null;
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>
    </div>
  );
}

function EpisodeRow({
  episode,
  displayNumber,
  open,
  onToggle,
  readOnly,
  refresh,
  renderVideo,
}: {
  episode: EpisodeAdmin;
  displayNumber: number;
  open: boolean;
  onToggle: () => void;
  readOnly: boolean;
  refresh: () => void;
  renderVideo?: EpisodeVideoRenderer;
}) {
  const toast = useToast();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: episode.id, disabled: readOnly });
  const save = async (patch: Record<string, unknown>) => {
    try {
      await unwrap(api.PATCH("/api/v1/admin/episodes/{id}", { params: { path: { id: episode.id } }, body: patch }));
      toast("Saved");
      refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Save failed", "error");
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete episode ${episode.number} “${episode.name}”?`)) return;
    await unwrap(api.DELETE("/api/v1/admin/episodes/{id}", { params: { path: { id: episode.id } } }));
    refresh();
  };

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("bg-panel", isDragging && "relative z-10 shadow-lg")}>
      <div className="flex items-center gap-2 px-2 py-2">
        {!readOnly && (
          <button type="button" className="cursor-grab touch-none rounded p-1 text-subtle hover:text-fg active:cursor-grabbing" aria-label={`Drag to reorder episode ${displayNumber}`} {...attributes} {...listeners}>
            <GripVertical className="size-4" />
          </button>
        )}
        <span className="w-6 text-center tabular text-[12.5px] text-muted">{displayNumber}</span>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="size-3.5 text-subtle" /> : <ChevronRight className="size-3.5 text-subtle" />}
          <span className="truncate font-medium">{episode.name}</span>
          {episode.runtime_minutes ? <span className="text-[12px] text-subtle">{episode.runtime_minutes}m</span> : null}
        </button>
        <VideoChip status={episode.video?.status} />
      </div>
      {open && (
        <div className="grid gap-4 border-t border-line bg-raised/40 p-4 md:grid-cols-[1fr_220px]">
          <fieldset disabled={readOnly} className="space-y-3">
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <Input defaultValue={episode.name} aria-label="Episode name" onBlur={(e) => e.target.value !== episode.name && void save({ name: e.target.value })} />
              <Input type="number" defaultValue={episode.runtime_minutes ?? ""} placeholder="min" aria-label="Runtime minutes" onBlur={(e) => void save({ runtime_minutes: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <Textarea rows={3} defaultValue={episode.synopsis ?? ""} placeholder="Episode synopsis" aria-label="Episode synopsis" onBlur={(e) => e.target.value !== (episode.synopsis ?? "") && void save({ synopsis: e.target.value })} />
            {renderVideo?.({ episode, readOnly, onChanged: refresh })}
            {!readOnly && <Button size="sm" variant="ghost" onClick={() => void remove()}><Trash2 className="size-3.5" /> Delete episode</Button>}
          </fieldset>
          <ImageSlot kind="thumbnail" label="Thumbnail" image={episode.thumbnail} disabled={readOnly} onAttach={(id) => save({ thumbnail_id: id })} />
        </div>
      )}
    </li>
  );
}
