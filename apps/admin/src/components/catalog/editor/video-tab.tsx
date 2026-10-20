"use client";

// Phase 3 replaces these with the resumable uploader, transcode monitor and marker editor.
import type { SeasonAdmin, TitleDetail } from "@/lib/types";
import type { EpisodeSlotProps } from "./seasons-tab";

export function VideoTab(_: { title: TitleDetail; attach: (field: "video_id" | "trailer_id", id: string | null) => Promise<void>; readOnly: boolean }) {
  return <p className="text-muted">Video upload arrives in the next phase.</p>;
}

export function EpisodeVideo(_: EpisodeSlotProps) {
  return null;
}

export function BulkEpisodeUpload(_: { season: SeasonAdmin; onDone: () => void }) {
  return null;
}
