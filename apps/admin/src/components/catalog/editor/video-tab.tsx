"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn, formatBytes, formatDuration, LazyLogoLoader } from "@netfly/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type Hls from "hls.js";
import {
  CircleAlert,
  Film,
  Flag,
  Languages,
  RotateCcw,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers/toast";
import { Badge, Button, Card, Input, Label } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { AdminVideo, EpisodeAdmin, SeasonAdmin, TitleDetail } from "@/lib/types";
import { IconButton, useAction, useConfirm } from "@/components/ui/actions";
import { useUploads, type UploadTarget } from "@/stores/uploads";
import type { EpisodeSlotProps } from "./seasons-tab";

const ACTIVE = ["uploading", "uploaded", "queued", "transcoding"];

function useVideo(id: string | null | undefined, initial?: AdminVideo | null) {
  return useQuery({
    queryKey: ["videos", id],
    enabled: !!id,
    initialData: initial && initial.id === id ? initial : undefined,
    queryFn: () => unwrap(api.GET("/api/v1/admin/videos/{id}", { params: { path: { id: id! } } })),
    refetchInterval: (q) => (q.state.data && ACTIVE.includes(q.state.data.status) ? 1500 : false),
  });
}

export function VideoTab({
  title,
  readOnly,
}: {
  title: TitleDetail;
  attach: (field: "video_id" | "trailer_id", id: string | null) => Promise<void>;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-4">
      {title.type === "movie" && (
        <VideoSlot
          heading="Feature"
          description="The movie itself. Uploads go straight to S3 and are transcoded into an adaptive HLS ladder."
          video={title.video}
          kind="feature"
          target={{ type: "title", id: title.id, field: "video_id", label: title.title }}
          readOnly={readOnly}
        />
      )}
      <VideoSlot
        heading="Trailer"
        description="Optional. Plays muted in the hero billboard and on hover previews."
        video={title.trailer}
        kind="trailer"
        target={{
          type: "title",
          id: title.id,
          field: "trailer_id",
          label: `${title.title} trailer`,
        }}
        readOnly={readOnly}
      />
      {title.type === "series" && (
        <p className="text-muted text-[12.5px]">
          Episode videos are managed in <strong>Seasons &amp; episodes</strong> — open an episode,
          or bulk-upload a whole season.
        </p>
      )}
    </div>
  );
}

function VideoSlot({
  heading,
  description,
  video,
  kind,
  target,
  readOnly,
  compact,
}: {
  heading: string;
  description?: string;
  video: AdminVideo | null | undefined;
  kind: "feature" | "episode" | "trailer";
  target: UploadTarget;
  readOnly: boolean;
  compact?: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const add = useUploads((s) => s.add);
  const items = useUploads((s) => s.items);
  const pending = useUploads((s) => s.pending);
  const live = useVideo(video?.id, video);
  const asset = live.data ?? video ?? null;
  const sameTarget = (t: UploadTarget) =>
    t.type === target.type &&
    t.id === target.id &&
    (t.type === "episode" || (target.type === "title" && t.field === target.field));
  const uploading = Object.values(items).find((i) => sameTarget(i.target) && i.state !== "done");
  const resumable = !uploading && pending.find((p) => sameTarget(p.target));
  const [dragging, setDragging] = useState(false);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (resumable && (file.name !== resumable.filename || file.size !== resumable.size)) {
      toast("That's a different file — starting a new upload", "info");
    }
    add(file, kind, target);
  };
  const retry = useAction(
    async () => {
      if (!asset) return;
      const updated = await unwrap(
        api.POST("/api/v1/admin/videos/{id}/retry", { params: { path: { id: asset.id } } }),
      );
      queryClient.setQueryData(["videos", asset.id], updated);
    },
    { success: "Transcode queued again" },
  );

  const body = (
    <>
      {asset ? (
        <AssetStatus
          asset={asset}
          retrying={retry.pending}
          onRetry={readOnly ? undefined : () => void retry.run()}
        />
      ) : !uploading ? (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            "text-muted hover:text-fg flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 text-[12.5px] transition-colors",
            compact ? "py-4" : "py-10",
            dragging ? "border-accent bg-accent/5" : "border-line",
          )}
        >
          <UploadCloud className="size-5" />
          {resumable
            ? `Select “${resumable.filename}” again to resume its upload`
            : "Drop a video or click to upload (MP4, MOV, MKV, WebM)"}
        </button>
      ) : null}
      {uploading && (
        <p className="bg-accent/5 flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px]">
          {/* The percentage is the progress; the loader only fills in until the first bytes land. */}
          {uploading.loaded === 0 && (
            <LazyLogoLoader size="sm" decorative className="[--nf-size:14px]" />
          )}
          Uploading {uploading.filename} — {Math.round((uploading.loaded / uploading.size) * 100)}%
          (see the upload panel)
        </p>
      )}
      {asset && !readOnly && !uploading && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => input.current?.click()}>
            <Upload className="size-3.5" /> Replace video
          </Button>
        </div>
      )}
      {asset?.status === "ready" && !compact && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <PreviewPlayer videoId={asset.id} />
          <Subtitles asset={asset} readOnly={readOnly} />
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="video/*,.mkv,.mov"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </>
  );

  if (compact) return <div>{body}</div>;
  return (
    <Card className="p-5">
      <div className="mb-3">
        <p className="font-medium">{heading}</p>
        {description && <p className="text-muted text-[12.5px]">{description}</p>}
      </div>
      {body}
    </Card>
  );
}

function AssetStatus({
  asset,
  onRetry,
  retrying,
}: {
  asset: AdminVideo;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const tone = asset.status === "ready" ? "green" : asset.status === "failed" ? "red" : "amber";
  const [showLog, setShowLog] = useState(false);
  return (
    <div className="border-line rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Film className="text-subtle size-4" />
        <span className="max-w-64 truncate font-medium">{asset.original_filename || "Video"}</span>
        <Badge tone={tone}>{asset.status}</Badge>
        {asset.source_height ? (
          <span className="text-muted text-[12px]">
            source {asset.source_width}×{asset.source_height} · {asset.source_fps?.toFixed(2)} fps ·{" "}
            {asset.source_codec}
          </span>
        ) : null}
        {asset.source_size ? (
          <span className="text-muted text-[12px]">· {formatBytes(asset.source_size)}</span>
        ) : null}
        {asset.duration ? (
          <span className="text-muted text-[12px]">· {formatDuration(asset.duration)}</span>
        ) : null}
        {asset.status === "failed" && onRetry && (
          <Button size="sm" className="ml-auto" onClick={onRetry} loading={retrying}>
            <RotateCcw className="size-3.5" /> Retry
          </Button>
        )}
      </div>
      {ACTIVE.includes(asset.status) && (
        <div className="mt-3">
          <div className="text-muted mb-1 flex justify-between text-[12px]">
            <span>{asset.stage || "Waiting…"}</span>
            <span className="tabular">{Math.round(asset.progress ?? 0)}%</span>
          </div>
          <div className="bg-raised h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-700"
              style={{ width: `${asset.progress ?? 0}%` }}
            />
          </div>
        </div>
      )}
      {asset.status === "failed" && (
        <div className="mt-2 text-[12.5px]">
          <p className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {asset.error}
          </p>
          {asset.log && (
            <>
              <button
                type="button"
                className="text-muted mt-1 underline"
                onClick={() => setShowLog(!showLog)}
              >
                {showLog ? "Hide" : "Show"} FFmpeg log
              </button>
              {showLog && (
                <pre className="bg-raised mt-2 max-h-56 overflow-auto rounded p-2 font-mono text-[12px] leading-relaxed">
                  {asset.log}
                </pre>
              )}
            </>
          )}
        </div>
      )}
      {asset.status === "ready" && asset.renditions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {asset.renditions.map((r) => (
            <Badge key={r.name}>
              {r.name} · {r.width}×{r.height} · {(r.bandwidth / 1e6).toFixed(1)} Mbps
              {r.codec && r.codec !== "h264" ? ` · ${r.codec}` : ""}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small hls.js player for staff previews; exposes the <video> for marker editing. */
export function PreviewPlayer({
  videoId,
  onVideo,
  className,
}: {
  videoId: string;
  onVideo?: (el: HTMLVideoElement) => void;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const preview = useQuery({
    queryKey: ["preview", videoId],
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/videos/{id}/preview", { params: { path: { id: videoId } } })),
    staleTime: 30 * 60_000,
  });
  useEffect(() => {
    const video = ref.current;
    if (!video || !preview.data) return;
    onVideo?.(video);
    let hls: Hls | null = null;
    const src = preview.data.master_url;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      void import("hls.js").then(({ default: HlsCtor }) => {
        if (!HlsCtor.isSupported()) return;
        hls = new HlsCtor({ startLevel: -1, capLevelToPlayerSize: true });
        hls.loadSource(src);
        hls.attachMedia(video);
      });
    }
    return () => hls?.destroy();
  }, [preview.data, onVideo]);
  return (
    <video
      ref={ref}
      controls
      playsInline
      preload="metadata"
      className={cn("aspect-video w-full rounded-lg bg-black", className)}
    >
      {preview.data && <track kind="metadata" src={preview.data.thumbnails_url} />}
    </video>
  );
}

function Subtitles({ asset, readOnly }: { asset: AdminVideo; readOnly: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState("en");
  const [label, setLabel] = useState("English");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await unwrap(
        api.POST("/api/v1/admin/videos/{id}/subtitles", {
          params: { path: { id: asset.id } },
          body: {
            file: file as unknown as string,
            language,
            label,
            is_default: asset.subtitles.length === 0,
            is_forced: false,
          },
          bodySerializer: (b) => {
            const form = new FormData();
            form.append("file", file);
            form.append("language", b.language);
            form.append("label", b.label);
            form.append("is_default", String(b.is_default));
            form.append("is_forced", "false");
            return form;
          },
        }),
      );
      toast(`${label} subtitles added`);
      void queryClient.invalidateQueries({ queryKey: ["videos", asset.id] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };
  const confirm = useConfirm();
  const remove = (subId: number, label: string) =>
    confirm({
      title: `Remove the ${label} subtitles?`,
      confirmLabel: "Remove",
      destructive: true,
      success: `${label} subtitles removed`,
      action: async () => {
        await unwrap(
          api.DELETE("/api/v1/admin/videos/{id}/subtitles/{sub_id}", {
            params: { path: { id: asset.id, sub_id: String(subId) } },
          }),
        );
        void queryClient.invalidateQueries({ queryKey: ["videos", asset.id] });
      },
    });

  return (
    <div className="border-line rounded-lg border p-3">
      <p className="mb-2 flex items-center gap-1.5 font-medium">
        <Languages className="text-subtle size-4" /> Subtitles
      </p>
      <ul className="mb-3 space-y-1">
        {asset.subtitles.map((s) => (
          <li key={s.id} className="flex items-center justify-between text-[12.5px]">
            <span>
              {s.label}{" "}
              <span className="text-subtle">
                ({s.language}
                {s.is_default ? ", default" : ""})
              </span>
            </span>
            {!readOnly && (
              <IconButton
                size="sm"
                tone="danger"
                label={`Remove ${s.label}`}
                onClick={() => remove(s.id, s.label)}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            )}
          </li>
        ))}
        {asset.subtitles.length === 0 && (
          <li className="text-muted text-[12.5px]">No subtitles yet.</li>
        )}
      </ul>
      {!readOnly && (
        <div className="grid grid-cols-[70px_1fr] gap-2">
          <Input
            value={language}
            onChange={(e) => setLanguage(e.target.value.toLowerCase())}
            aria-label="Language code"
          />
          <Input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" />
          <Button
            size="sm"
            className="col-span-2"
            loading={busy}
            onClick={() => input.current?.click()}
          >
            <Upload className="size-3.5" /> Add .vtt / .srt
          </Button>
          <input
            ref={input}
            type="file"
            accept=".vtt,.srt"
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );
}

/** Per-episode uploader + Skip Intro / Next Episode markers set by scrubbing the preview. */
export function EpisodeVideo({ episode, readOnly, onChanged }: EpisodeSlotProps) {
  const live = useVideo(episode.video?.id, episode.video);
  const asset = live.data ?? episode.video ?? null;
  return (
    <div className="space-y-3">
      <Label>Video</Label>
      <VideoSlot
        compact
        heading="Episode video"
        video={episode.video}
        kind="episode"
        target={{
          type: "episode",
          id: episode.id,
          label: `Episode ${episode.number} · ${episode.name}`,
        }}
        readOnly={readOnly}
      />
      {asset?.status === "ready" && (
        <MarkerEditor
          episode={episode}
          videoId={asset.id}
          duration={asset.duration ?? 0}
          readOnly={readOnly}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}

function MarkerEditor({
  episode,
  videoId,
  duration,
  readOnly,
  onSaved,
}: {
  episode: EpisodeAdmin;
  videoId: string;
  duration: number;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [marks, setMarks] = useState({
    intro_start: episode.intro_start ?? null,
    intro_end: episode.intro_end ?? null,
    credits_start: episode.credits_start ?? null,
  });

  const [savingMark, setSavingMark] = useState<keyof typeof marks | null>(null);
  const setMark = async (key: keyof typeof marks, value: number | null) => {
    if (savingMark) return;
    const next = { ...marks, [key]: value === null ? null : Math.round(value * 10) / 10 };
    setMarks(next);
    setSavingMark(key);
    try {
      await unwrap(
        api.PATCH("/api/v1/admin/episodes/{id}", {
          params: { path: { id: episode.id } },
          body: { [key]: next[key] },
        }),
      );
      toast("Marker saved");
      onSaved();
    } catch (e) {
      toast(
        e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : "Couldn't save marker",
        "error",
      );
      setMarks(marks);
    } finally {
      setSavingMark(null);
    }
  };
  const pos = (v: number | null) =>
    v !== null && duration ? `${(v / duration) * 100}%` : undefined;

  return (
    <div className="border-line rounded-lg border p-3">
      <p className="mb-2 flex items-center gap-1.5 font-medium">
        <Flag className="text-subtle size-4" /> Skip Intro & Next Episode markers
      </p>
      <PreviewPlayer videoId={videoId} onVideo={setVideo} className="max-h-64" />
      <div className="bg-raised relative mt-3 h-2 rounded-full" aria-hidden>
        {marks.intro_start !== null && marks.intro_end !== null && (
          <div
            className="absolute inset-y-0 rounded-full bg-sky-500/60"
            style={{
              left: pos(marks.intro_start),
              width: `${((marks.intro_end - marks.intro_start) / duration) * 100}%`,
            }}
          />
        )}
        {marks.credits_start !== null && (
          <div
            className="absolute inset-y-0 right-0 rounded-r-full bg-amber-500/60"
            style={{ left: pos(marks.credits_start) }}
          />
        )}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(
          [
            ["intro_start", "Intro starts"],
            ["intro_end", "Intro ends"],
            ["credits_start", "Credits start"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="bg-raised/60 rounded-md p-2">
            <p className="text-muted text-[12px]">{label}</p>
            <p className="tabular font-medium">
              {marks[key] !== null ? formatDuration(marks[key]!) : "—"}
            </p>
            {!readOnly && (
              <div className="mt-1 flex gap-1">
                <Button
                  size="sm"
                  loading={savingMark === key}
                  disabled={!!savingMark}
                  onClick={() => video && void setMark(key, video.currentTime)}
                >
                  Set to playhead
                </Button>
                {marks[key] !== null && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!savingMark}
                    onClick={() => void setMark(key, null)}
                    aria-label={`Clear ${label}`}
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}
            {marks[key] !== null && video && (
              <button
                type="button"
                className="text-accent mt-1 text-[12px] hover:underline"
                onClick={() => {
                  video.currentTime = marks[key]!;
                }}
              >
                Jump here
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "S01E03", "E3", "Episode 3", "03 - Name": the episode number in a filename, if any. */
export function parseEpisodeNumber(filename: string): number | null {
  const m =
    /s\d{1,2}[ ._-]?e(\d{1,3})/i.exec(filename) ??
    /(?:^|[ ._-])e(?:p(?:isode)?)?[ ._-]?(\d{1,3})(?![\d])/i.exec(filename) ??
    /^(\d{1,3})(?=[ ._-])/.exec(filename);
  return m ? Number(m[1]) : null;
}

function prettyName(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const cleaned = stem
    .replace(/s\d{1,2}[ ._-]?e\d{1,3}/i, "")
    .replace(/^(\d{1,3})(?=[ ._-])/, "")
    .replace(/[._]+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .trim();
  return cleaned || stem;
}

export function BulkEpisodeUpload({ season, onDone }: { season: SeasonAdmin; onDone: () => void }) {
  const toast = useToast();
  const add = useUploads((s) => s.add);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const sorted = [...files].sort((a, b) => {
      const na = parseEpisodeNumber(a.name) ?? Number.MAX_SAFE_INTEGER;
      const nb = parseEpisodeNumber(b.name) ?? Number.MAX_SAFE_INTEGER;
      return na - nb || a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    try {
      for (const file of sorted) {
        // Numbers continue after the season's last episode (server assigns them).
        const episode = await unwrap(
          api.POST("/api/v1/admin/seasons/{id}/episodes", {
            params: { path: { id: season.id } },
            body: { name: prettyName(file.name) },
          }),
        );
        add(file, "episode", {
          type: "episode",
          id: episode.id,
          label: `S${season.number}:E${episode.number}`,
        });
      }
      toast(`${sorted.length} episode${sorted.length === 1 ? "" : "s"} created — uploading`);
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Bulk upload failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" loading={busy} onClick={() => input.current?.click()}>
        <UploadCloud className="size-3.5" /> Bulk upload episodes
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept="video/*,.mkv,.mov"
        hidden
        onChange={(e) => void run(e.target.files)}
      />
    </>
  );
}
