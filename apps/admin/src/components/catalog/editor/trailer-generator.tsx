"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Play, Scissors, Timer } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useConfig } from "@/components/providers/config";
import { Button, Input, Label, Select, Switch } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { formatTimecode, parseTimecode, spokenTime } from "@/lib/timecode";
import type { AdminVideo, TitleDetail } from "@/lib/types";
import { PreviewPlayer, useVideo } from "./video-tab";

export type TrailerSource = "feature" | { episode_id: number };

export type TrailerPrefill = {
  source: TrailerSource;
  start: number;
  end: number;
  fade: boolean;
  audio: boolean;
};

/** "Generate from video": pick a range of the title's own video and cut it into a trailer. */
export function TrailerGenerator({
  title,
  readOnly,
  prefill,
  onStarted,
  onCancel,
}: {
  title: TitleDetail;
  readOnly: boolean;
  prefill?: TrailerPrefill | null;
  onStarted: (asset: AdminVideo) => void;
  onCancel?: () => void;
}) {
  const config = useConfig();
  const shortest = config.num("trailer.min_seconds", 5);
  const longest = config.num("trailer.max_seconds", 300);
  const ids = useId();
  const series = title.type === "series";

  // -- source ------------------------------------------------------------------
  const seasons = useQuery({
    queryKey: ["seasons", title.id],
    enabled: series,
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/titles/{id}/seasons", { params: { path: { id: title.id } } })),
  });
  const readySeasons = useMemo(
    () =>
      (seasons.data ?? [])
        .map((s) => ({ ...s, episodes: s.episodes.filter((e) => e.video?.status === "ready") }))
        .filter((s) => s.episodes.length > 0),
    [seasons.data],
  );
  const prefillEpisode =
    prefill && typeof prefill.source === "object" ? prefill.source.episode_id : null;
  const [episodeId, setEpisodeId] = useState<number | null>(prefillEpisode);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  useEffect(() => {
    const first = readySeasons[0];
    if (!series || !first) return;
    const holder = readySeasons.find((s) => s.episodes.some((e) => e.id === episodeId));
    if (holder) {
      setSeasonId(holder.id);
      return;
    }
    setSeasonId(first.id);
    setEpisodeId(first.episodes[0]?.id ?? null);
  }, [series, readySeasons, episodeId]);
  const season = readySeasons.find((s) => s.id === seasonId);
  const episode = season?.episodes.find((e) => e.id === episodeId);

  const feature = useVideo(series ? null : title.video?.id, title.video);
  const sourceVideo: AdminVideo | null | undefined = series
    ? episode?.video
    : (feature.data ?? title.video);
  const sourceLabel = series
    ? episode && season
      ? `S${season.number}:E${episode.number}`
      : "an episode"
    : "Feature";
  const notReady = series
    ? seasons.isPending
      ? "Loading episodes…"
      : readySeasons.length === 0
        ? "Upload an episode and let it finish processing first."
        : null
    : !sourceVideo
      ? "Upload the feature first."
      : sourceVideo.status === "failed"
        ? "The feature failed to process — fix it in Upload, then come back."
        : sourceVideo.status !== "ready"
          ? `The feature is still processing (${Math.round(sourceVideo.progress ?? 0)} %).`
          : null;
  const duration = sourceVideo?.status === "ready" ? (sourceVideo.duration ?? 0) : 0;
  const disabled = readOnly || !!notReady;

  // -- range -------------------------------------------------------------------
  const [start, setStart] = useState<number | null>(prefill?.start ?? null);
  const [end, setEnd] = useState<number | null>(prefill?.end ?? null);
  const [fade, setFade] = useState(prefill?.fade ?? true);
  const [audio, setAudio] = useState(prefill?.audio ?? true);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stopAt = useRef<number | null>(null);

  const problem = (() => {
    if (start === null || end === null) return "Set a start and an end.";
    if (end <= start) return "The end must be after the start.";
    if (duration && end > duration + 0.05)
      return `The video is only ${formatTimecode(duration)} long — end the trailer at or before it.`;
    if (end - start < shortest)
      return `A trailer must be at least ${formatTimecode(shortest)} long (${formatTimecode(end - start)} selected).`;
    if (end - start > longest)
      return `A trailer can be at most ${formatTimecode(longest)} long (${formatTimecode(end - start)} selected).`;
    return null;
  })();

  const playhead = () => (video ? Math.round(video.currentTime * 10) / 10 : null);
  const setFromPlayhead = (which: "start" | "end") => {
    const t = playhead();
    if (t === null) return;
    (which === "start" ? setStart : setEnd)(t);
  };

  // Preview selection: play from the start, pause at the end.
  useEffect(() => {
    if (!video) return;
    const onTime = () => {
      if (stopAt.current !== null && video.currentTime >= stopAt.current) {
        video.pause();
        stopAt.current = null;
      }
    };
    const onPause = () => {
      stopAt.current = null;
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", onPause);
    };
  }, [video]);
  const previewSelection = () => {
    if (!video || start === null || end === null) return;
    video.currentTime = start;
    void video.play().then(() => {
      stopAt.current = end;
    });
  };

  const submit = async () => {
    if (problem || disabled || !sourceVideo) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const asset = await unwrap(
        api.POST("/api/v1/admin/titles/{id}/trailer/generate", {
          params: { path: { id: title.id } },
          body: {
            source: series ? { episode_id: episode!.id } : "feature",
            start_seconds: start!,
            end_seconds: end!,
            fade,
            audio,
          },
        }),
      );
      onStarted(asset);
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : "Couldn't start generating the trailer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {series ? (
          <>
            <div>
              <Label htmlFor={`${ids}-season`}>Season</Label>
              <Select
                id={`${ids}-season`}
                value={seasonId ?? ""}
                disabled={disabled}
                onChange={(e) => {
                  const next = readySeasons.find((s) => s.id === Number(e.target.value));
                  setSeasonId(next?.id ?? null);
                  setEpisodeId(next?.episodes[0]?.id ?? null);
                }}
              >
                {readySeasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    Season {s.number}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor={`${ids}-episode`}>Episode</Label>
              <Select
                id={`${ids}-episode`}
                className="w-full"
                value={episodeId ?? ""}
                disabled={disabled}
                onChange={(e) => setEpisodeId(Number(e.target.value))}
              >
                {season?.episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    E{ep.number} · {ep.name}
                  </option>
                ))}
              </Select>
            </div>
          </>
        ) : (
          <p className="text-[12.5px]">
            <span className="text-muted">Source:</span> <strong>Feature</strong>
          </p>
        )}
      </div>

      {notReady && (
        <p className="bg-raised text-muted flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px]">
          <Timer className="size-3.5 shrink-0" /> {notReady}
        </p>
      )}

      {sourceVideo?.status === "ready" && (
        <div
          onKeyDown={(e) => {
            if (disabled || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === "i" || e.key === "I") {
              e.preventDefault();
              setFromPlayhead("start");
            } else if (e.key === "o" || e.key === "O") {
              e.preventDefault();
              setFromPlayhead("end");
            }
          }}
        >
          <PreviewPlayer key={sourceVideo.id} videoId={sourceVideo.id} onVideo={setVideo} />
          <p className="text-subtle mt-1 text-[12px]">
            Tip: with the player focused, press{" "}
            <kbd className="border-line rounded border px-1 font-sans">I</kbd> to set the start and{" "}
            <kbd className="border-line rounded border px-1 font-sans">O</kbd> to set the end.
          </p>
          <RangeBar
            videoId={sourceVideo.id}
            duration={duration}
            start={start}
            end={end}
            disabled={disabled}
            onChange={(s, e) => {
              setStart(s);
              setEnd(e);
            }}
            onSeek={(t) => {
              if (video) video.currentTime = t;
            }}
          />
        </div>
      )}

      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Trailer range</legend>
        <TimeField
          label="Start"
          value={start}
          onChange={setStart}
          onPlayhead={() => setFromPlayhead("start")}
          canUsePlayhead={!!video}
        />
        <TimeField
          label="End"
          value={end}
          onChange={setEnd}
          onPlayhead={() => setFromPlayhead("end")}
          canUsePlayhead={!!video}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p role="status" aria-live="polite" className="tabular text-[13px] font-medium">
          {start !== null && end !== null && end > start
            ? `Trailer: ${formatTimecode(start)} → ${formatTimecode(end)} · ${formatTimecode(end - start)} long`
            : "Trailer: choose a range"}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || !video || start === null || end === null || end <= start}
          onClick={previewSelection}
        >
          <Play className="size-3.5" /> Preview selection
        </Button>
      </div>
      {problem && start !== null && end !== null && (
        <p className="flex items-start gap-1.5 text-[12.5px] text-amber-700 dark:text-amber-400">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {problem}
        </p>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-[13px]">
          <Switch
            checked={fade}
            onCheckedChange={setFade}
            label="Fade in/out"
            disabled={disabled}
          />
          Fade in/out
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <Switch
            checked={audio}
            onCheckedChange={setAudio}
            label="Include audio"
            disabled={disabled}
          />
          Include audio
        </label>
        <p className="text-subtle text-[12px]">
          Trailers play muted in the hero and on hover; audio is used when a viewer unmutes.
        </p>
      </div>

      {serverError && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[12.5px] text-red-600 dark:text-red-400"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {serverError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={disabled || !!problem}
          loading={submitting}
          onClick={() => void submit()}
        >
          <Scissors className="size-3.5" /> Generate trailer
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <span className="text-subtle self-center text-[12px]">
          Cut from {sourceLabel}; the current trailer stays until the new one is ready.
        </span>
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  onPlayhead,
  canUsePlayhead,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  onPlayhead: () => void;
  canUsePlayhead: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : formatTimecode(value));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  // Values set elsewhere (the playhead, the range bar) show up unless the editor is typing.
  useEffect(() => {
    if (!focused.current) {
      setText(value === null ? "" : formatTimecode(value));
      setInvalid(false);
    }
  }, [value]);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          inputMode="text"
          autoComplete="off"
          placeholder="0:00"
          className="tabular min-w-0 flex-1"
          value={text}
          invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : `${id}-hint`}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseTimecode(e.target.value);
            if (parsed !== null) {
              setInvalid(false);
              onChange(parsed);
            }
          }}
          onBlur={() => {
            focused.current = false;
            if (!text.trim()) {
              setInvalid(false);
              onChange(null);
              return;
            }
            const parsed = parseTimecode(text);
            setInvalid(parsed === null);
            if (parsed !== null) {
              onChange(parsed);
              setText(formatTimecode(parsed));
            }
          }}
        />
        <Button
          size="md"
          disabled={!canUsePlayhead}
          onClick={onPlayhead}
          aria-label={`Set to current time for ${label.toLowerCase()}`}
        >
          Set to current time
        </Button>
      </div>
      {!invalid && (
        <p id={`${id}-hint`} className="text-subtle mt-1 text-[12px]">
          Like 7:00, 420, 1:07:00 or 7m
        </p>
      )}
      {invalid && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-[12px] text-red-600 dark:text-red-400"
        >
          Use a time like 7:00, 420, 1:07:00 or 7m.
        </p>
      )}
    </div>
  );
}

type Thumb = {
  start: number;
  end: number;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function useThumbnails(videoId: string): Thumb[] {
  const preview = useQuery({
    queryKey: ["preview", videoId],
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/videos/{id}/preview", { params: { path: { id: videoId } } })),
    staleTime: 30 * 60_000,
  });
  const thumbs = useQuery({
    queryKey: ["thumbs", videoId, preview.data?.thumbnails_url],
    enabled: !!preview.data?.thumbnails_url,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const res = await fetch(preview.data!.thumbnails_url, { credentials: "include" });
      return res.ok ? parseThumbs(await res.text()) : [];
    },
  });
  return thumbs.data ?? [];
}

function parseThumbs(vtt: string): Thumb[] {
  const seconds = (t: string) => {
    const parts = t.split(":").map(Number);
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  };
  const out: Thumb[] = [];
  const re = /([\d:.]+)\s+-->\s+([\d:.]+)\s*\n(\S+)#xywh=(\d+),(\d+),(\d+),(\d+)/g;
  for (let m = re.exec(vtt); m; m = re.exec(vtt)) {
    const [, from = "", to = "", url = "", x, y, w, h] = m;
    out.push({ start: seconds(from), end: seconds(to), url, x: +x!, y: +y!, w: +w!, h: +h! });
  }
  return out;
}

/** The whole video as a bar; the selection between two draggable, keyboard-operable handles. */
function RangeBar({
  videoId,
  duration,
  start,
  end,
  disabled,
  onChange,
  onSeek,
}: {
  videoId: string;
  duration: number;
  start: number | null;
  end: number | null;
  disabled: boolean;
  onChange: (start: number, end: number) => void;
  onSeek: (t: number) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const thumbs = useThumbnails(videoId);
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const s = start ?? 0;
  const e = end ?? Math.min(duration, s + 30);
  const pct = (t: number) =>
    `${duration ? (Math.min(Math.max(t, 0), duration) / duration) * 100 : 0}%`;

  const timeAt = useCallback(
    (clientX: number) => {
      const rect = bar.current!.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return { t: Math.round(ratio * duration * 10) / 10, x: clientX - rect.left };
    },
    [duration],
  );
  const move = (which: "start" | "end", t: number) => {
    const clamped = Math.min(Math.max(t, 0), duration);
    if (which === "start") onChange(Math.min(clamped, e - 0.1), e);
    else onChange(s, Math.max(clamped, s + 0.1));
  };
  const thumb = hover ? thumbs.find((th) => hover.t >= th.start && hover.t < th.end) : undefined;

  const handle = (which: "start" | "end") => {
    const value = which === "start" ? s : e;
    return (
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={which === "start" ? "Trailer start" : "Trailer end"}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${which === "start" ? "Start" : "End"}, ${spokenTime(value)}`}
        aria-disabled={disabled || undefined}
        onKeyDown={(ev) => {
          if (disabled) return;
          const step = ev.shiftKey ? 10 : 1;
          const delta =
            ev.key === "ArrowLeft" || ev.key === "ArrowDown"
              ? -step
              : ev.key === "ArrowRight" || ev.key === "ArrowUp"
                ? step
                : null;
          if (delta === null) return;
          ev.preventDefault();
          move(which, value + delta);
          onSeek(Math.min(Math.max(value + delta, 0), duration));
        }}
        onPointerDown={(ev) => {
          if (disabled) return;
          ev.stopPropagation();
          ev.currentTarget.setPointerCapture(ev.pointerId);
          setDragging(which);
        }}
        onPointerMove={(ev) => {
          if (dragging !== which) return;
          const at = timeAt(ev.clientX);
          setHover(at);
          move(which, at.t);
        }}
        onPointerUp={(ev) => {
          if (dragging !== which) return;
          setDragging(null);
          onSeek(timeAt(ev.clientX).t);
        }}
        className={cn(
          // 44 px touch target around a slim visible grip.
          "absolute top-1/2 z-10 flex h-11 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center outline-none",
          "focus-visible:[&>span]:ring-accent/40 focus-visible:[&>span]:ring-4",
          disabled && "cursor-not-allowed opacity-50",
        )}
        style={{ left: pct(value) }}
      >
        <span className="bg-accent block h-6 w-2 rounded-sm shadow" />
      </div>
    );
  };

  return (
    <div className="mt-3 select-none">
      <div className="relative">
        <div
          ref={bar}
          className="bg-raised relative h-3 cursor-pointer rounded-full"
          onPointerMove={(ev) => setHover(timeAt(ev.clientX))}
          onPointerLeave={() => !dragging && setHover(null)}
          onClick={(ev) => onSeek(timeAt(ev.clientX).t)}
        >
          {start !== null && end !== null && (
            <div
              className="bg-accent/40 absolute inset-y-0 rounded-full"
              style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }}
            />
          )}
        </div>
        {start !== null && end !== null && (
          <>
            {handle("start")}
            {handle("end")}
          </>
        )}
        {hover && duration > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2"
            style={{
              left: Math.min(
                Math.max(hover.x, (thumb?.w ?? 40) / 2),
                (bar.current?.clientWidth ?? 0) - (thumb?.w ?? 40) / 2,
              ),
            }}
          >
            {thumb && (
              <div
                className="border-line rounded border bg-black bg-no-repeat shadow"
                style={{
                  width: thumb.w,
                  height: thumb.h,
                  backgroundImage: `url("${thumb.url}")`,
                  backgroundPosition: `-${thumb.x}px -${thumb.y}px`,
                }}
              />
            )}
            <p className="tabular mx-auto mt-1 w-fit rounded bg-black/80 px-1.5 text-[12px] text-white">
              {formatTimecode(hover.t)}
            </p>
          </div>
        )}
      </div>
      <div className="text-subtle tabular mt-3 flex justify-between text-[12px]">
        <span>0:00</span>
        <span>{formatTimecode(duration)}</span>
      </div>
    </div>
  );
}
