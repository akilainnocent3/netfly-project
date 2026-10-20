import type { Schemas } from "@netfly/api-client";
import { api } from "../api";

type ProgressBody = Schemas["ProgressBatchRequest"];
type EventsBody = Schemas["EventBatchRequest"];

type EventKind = "start" | "play" | "pause" | "seek" | "quality" | "rebuffer" | "complete" | "error" | "heartbeat";

type PendingEvent = EventsBody["events"][number] & { kind: EventKind };

/**
 * Saves watch progress (every N seconds, on pause, on exit) and batches
 * playback analytics (startup time, rebuffers, quality switches) for admin.
 */
export class PlaybackTracker {
  private events: PendingEvent[] = [];
  private watched = 0;
  private lastTick: number | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSaved = -1;

  constructor(
    private readonly ctx: { sessionId: string; titleId: number; episodeId: number | null; progressEvery: number; flushEvery: number },
    private readonly video: HTMLVideoElement,
    private readonly bitrate: () => number,
  ) {}

  start(): void {
    this.progressTimer = setInterval(() => {
      if (!this.video.paused) void this.saveProgress();
    }, this.ctx.progressEvery * 1000);
    this.flushTimer = setInterval(() => void this.flush(), this.ctx.flushEvery * 1000);
    this.heartbeat = setInterval(() => {
      if (!this.video.paused) this.track("heartbeat", { value: this.bitrate() });
    }, 30_000);
  }

  /** Called on every timeupdate: accumulates real watch time (not seeks). */
  tick(): void {
    const now = performance.now();
    if (this.lastTick !== null && !this.video.paused && !this.video.seeking) {
      const delta = ((now - this.lastTick) / 1000) * this.video.playbackRate;
      if (delta > 0 && delta < 2) this.watched += delta;
    }
    this.lastTick = now;
  }

  track(kind: EventKind, extra: { value?: number | null; data?: Record<string, unknown> } = {}): void {
    this.events.push({
      session_id: this.ctx.sessionId,
      kind,
      title_id: this.ctx.titleId,
      episode_id: this.ctx.episodeId,
      position: Math.round(this.video.currentTime * 10) / 10,
      value: extra.value ?? null,
      data: extra.data,
      ts: new Date().toISOString(),
    });
    if (this.events.length >= 50) void this.flush();
  }

  async saveProgress(keepalive = false): Promise<void> {
    const position = this.video.currentTime;
    const duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;
    if (!duration || (Math.abs(position - this.lastSaved) < 1 && this.watched < 1)) return;
    const watched = Math.min(3600, this.watched);
    this.watched = 0;
    this.lastSaved = position;
    const body: ProgressBody = { updates: [{ title_id: this.ctx.titleId, episode_id: this.ctx.episodeId, position, duration, watched }] };
    try {
      if (keepalive) await this.beacon("/api/v1/playback/progress", body);
      else await api.POST("/api/v1/playback/progress", { body });
    } catch {
      /* best effort — the next save carries the newest position */
    }
  }

  async flush(keepalive = false): Promise<void> {
    if (!this.events.length) return;
    const body: EventsBody = { events: this.events.splice(0, 200) };
    try {
      if (keepalive) await this.beacon("/api/v1/playback/events", body);
      else await api.POST("/api/v1/playback/events", { body });
    } catch {
      /* analytics are best effort */
    }
  }

  /** Exit paths (pagehide/unmount) use keepalive fetches so the last position is never lost. */
  private async beacon(path: string, body: ProgressBody | EventsBody): Promise<void> {
    const token = api.session.token;
    await fetch(path, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  }

  stop(): void {
    for (const t of [this.progressTimer, this.flushTimer, this.heartbeat]) if (t) clearInterval(t);
    void this.saveProgress(true);
    void this.flush(true);
  }
}
