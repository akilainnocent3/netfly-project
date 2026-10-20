"use client";

import { unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import * as Tabs from "@radix-ui/react-tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { DetailsTab } from "@/components/catalog/editor/details-tab";
import { MediaTab } from "@/components/catalog/editor/media-tab";
import { PublishingTab } from "@/components/catalog/editor/publishing-tab";
import { RelatedTab } from "@/components/catalog/editor/related-tab";
import { SeasonsTab } from "@/components/catalog/editor/seasons-tab";
import { VideoTab, EpisodeVideo, BulkEpisodeUpload } from "@/components/catalog/editor/video-tab";
import { StatusChip, TranslationChip } from "@/components/catalog/status";
import { Thumb } from "@/components/catalog/thumb";
import { useAuth } from "@/components/providers/auth";
import { useConfig } from "@/components/providers/config";
import { Button, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { TitleDetail } from "@/lib/types";
import { useAutosave, type SaveState } from "@/lib/use-autosave";

const TABS = ["details", "media", "video", "seasons", "related", "publishing"] as const;
type Tab = (typeof TABS)[number];

export default function TitleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = Number(rawId);
  const { can } = useAuth();
  const config = useConfig();
  const queryClient = useQueryClient();
  const readOnly = !can("content_manager");
  const [tab, setTab] = useState<Tab>("details");
  const [draft, setDraft] = useState<TitleDetail | null>(null);

  const title = useQuery({
    queryKey: ["title", id],
    queryFn: () => unwrap(api.GET("/api/v1/admin/titles/{id}", { params: { path: { id } } })),
    refetchInterval: (q) => {
      const t = q.state.data;
      const busy = t && [t.poster, t.backdrop, t.logo].some((i) => i?.status === "processing");
      const video =
        t && [t.video, t.trailer].some((v) => v && !["ready", "failed"].includes(v.status));
      return busy || video ? 2000 : false;
    },
  });

  // Server data flows into the draft, but local unsaved edits win.
  useEffect(() => {
    if (title.data)
      setDraft((d) =>
        d && d.id === title.data.id
          ? { ...title.data, ...pendingOverlay(d, title.data) }
          : title.data,
      );
  }, [title.data]);

  const autosave = useAutosave<Record<string, unknown>>(async (patch) => {
    const updated = await unwrap(
      api.PATCH("/api/v1/admin/titles/{id}", { params: { path: { id } }, body: patch }),
    );
    queryClient.setQueryData(["title", id], updated);
    void queryClient.invalidateQueries({ queryKey: ["titles"] });
  });

  const change = (patch: Partial<TitleDetail> & { genre_ids?: number[] }) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    autosave.queue(patch);
  };
  const attach = async (
    field: "poster_id" | "backdrop_id" | "logo_id" | "video_id" | "trailer_id",
    value: string | null,
  ) => {
    const updated = await unwrap(
      api.PATCH("/api/v1/admin/titles/{id}", {
        params: { path: { id } },
        body: { [field]: value },
      }),
    );
    queryClient.setQueryData(["title", id], updated);
  };

  if (title.isPending || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-96" />
        <Skeleton className="h-9 w-[480px]" />
        <Skeleton className="h-[420px]" />
      </div>
    );
  }
  if (title.isError) return <p className="text-red-500">{title.error.message}</p>;

  const clientUrl = config
    .str("content.client_app_url", "http://localhost:3000")
    .replace(/\/$/, "");
  const visibleTabs = TABS.filter((t) => draft.type === "series" || t !== "seasons");
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Link
          href="/titles"
          className="text-muted hover:bg-hover hover:text-fg grid size-8 place-items-center rounded-md"
          aria-label="Back to titles"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Thumb image={draft.poster} className="w-10" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] font-semibold tracking-tight">
            {draft.title || "Untitled"}
          </h1>
          <div className="text-muted mt-0.5 flex items-center gap-2 text-[12.5px]">
            <StatusChip status={draft.status ?? "draft"} />
            <TranslationChip value={draft.translation_status} translator={draft.translator_name} />
            <span>{draft.type === "series" ? "Series" : "Movie"}</span>
          </div>
        </div>
        <SaveIndicator state={autosave.state} />
        <a href={`${clientUrl}/title/${draft.slug}`} target="_blank" rel="noreferrer">
          <Button>
            <ExternalLink className="size-3.5" /> Preview as viewer
          </Button>
        </a>
      </div>

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <Tabs.List
          className="border-line mb-4 flex gap-1 border-b"
          aria-label="Title editor sections"
        >
          {visibleTabs.map((t) => (
            <Tabs.Trigger
              key={t}
              value={t}
              className={cn(
                "-mb-px h-9 border-b-2 px-3 text-[13px] capitalize transition-colors",
                tab === t
                  ? "border-accent text-fg font-medium"
                  : "text-muted hover:text-fg border-transparent",
              )}
            >
              {t === "seasons" ? "Seasons & episodes" : t === "related" ? "Related titles" : t}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {autosave.errors.form && (
          <p className="mb-3 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-400">
            <CircleAlert className="size-4" /> {autosave.errors.form}
          </p>
        )}
        <Tabs.Content value="details">
          <DetailsTab
            draft={draft}
            onChange={change}
            errors={autosave.errors}
            readOnly={readOnly}
          />
        </Tabs.Content>
        <Tabs.Content value="media">
          <MediaTab title={draft} attach={attach} readOnly={readOnly} />
        </Tabs.Content>
        <Tabs.Content value="video">
          <VideoTab title={draft} attach={attach} readOnly={readOnly} />
        </Tabs.Content>
        {draft.type === "series" && (
          <Tabs.Content value="seasons">
            <SeasonsTab
              titleId={draft.id}
              readOnly={readOnly}
              renderEpisodeVideo={(props) => <EpisodeVideo {...props} />}
              renderSeasonTools={(season, refresh) => (
                <BulkEpisodeUpload season={season} onDone={refresh} />
              )}
            />
          </Tabs.Content>
        )}
        <Tabs.Content value="related">
          <RelatedTab titleId={draft.id} readOnly={readOnly} />
        </Tabs.Content>
        <Tabs.Content value="publishing">
          <PublishingTab
            title={draft}
            onChange={change}
            errors={autosave.errors}
            readOnly={readOnly}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

/** Keep fields the user is editing (typed text) while server refreshes arrive. */
function pendingOverlay(local: TitleDetail, server: TitleDetail): Partial<TitleDetail> {
  const keys = [
    "title",
    "original_title",
    "slug",
    "synopsis",
    "short_synopsis",
    "translator_name",
    "rights_holder",
  ] as const;
  const overlay: Partial<TitleDetail> = {};
  for (const key of keys)
    if (local[key] !== server[key] && document.activeElement?.tagName.match(/INPUT|TEXTAREA/))
      Object.assign(overlay, { [key]: local[key] });
  return overlay;
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span className="text-muted flex items-center gap-1.5 text-[12.5px]" aria-live="polite">
      {state === "saving" || state === "dirty" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </>
      ) : state === "saved" ? (
        <>
          <Check className="size-3.5 text-emerald-500" /> Saved
        </>
      ) : (
        <>
          <CircleAlert className="size-3.5 text-red-500" /> Not saved
        </>
      )}
    </span>
  );
}
