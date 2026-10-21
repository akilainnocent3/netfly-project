import { ApiError, unwrap } from "@netfly/api-client";
import { api } from "../api";
import { publishUsage, type UsageSnapshot } from "../usage";

/**
 * Reports viewing time for one metered playback session. The server decides what counts
 * (never more than the time that really passed between beats); between beats the remaining
 * allowance is counted down locally so the player can stop right at the limit.
 *
 * Only content time is reported: the brand pre-roll, pauses, seeks and buffering never are.
 */
export class UsageMeter {
  private watched = 0;
  private lastTick: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight = false;
  private stopped = false;
  /** Remaining seconds at the last snapshot, and content seconds watched since then. */
  private remainingAt: number | null = null;
  private sinceSnapshot = 0;

  constructor(
    private sessionId: string,
    private readonly video: HTMLVideoElement,
    private readonly handlers: {
      everySeconds: number;
      onSnapshot: (snapshot: UsageSnapshot) => void;
      /** The lease was lost (e.g. the server restarted): get a new session id, or null. */
      renewSession: () => Promise<string | null>;
    },
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      if (!this.video.paused) void this.beat(true);
    }, this.handlers.everySeconds * 1000);
  }

  /** Seed the local countdown (e.g. from the usage query) before the first beat. */
  seed(snapshot: UsageSnapshot | undefined): void {
    if (snapshot && this.remainingAt === null) this.absorb(snapshot);
  }

  /** On every timeupdate while content plays: real playback time only (no seeks, no stalls). */
  tick(): void {
    const now = performance.now();
    if (this.lastTick !== null && !this.video.paused && !this.video.seeking) {
      const delta = (now - this.lastTick) / 1000;
      if (delta > 0 && delta < 2) {
        this.watched += delta;
        this.sinceSnapshot += delta;
      }
    }
    this.lastTick = now;
  }

  /** Seconds left before the tightest limit (null = unlimited / staff). */
  remaining(): number | null {
    return this.remainingAt === null ? null : Math.max(0, this.remainingAt - this.sinceSnapshot);
  }

  /** Resuming: restart the server's clock so the paused time isn't measured. */
  resumed(): void {
    this.lastTick = null;
    void this.beat(false);
  }

  /** Pausing: credit what just played. */
  paused(): void {
    this.lastTick = null;
    if (this.watched > 0) void this.beat(true);
  }

  async beat(playing: boolean, keepalive = false): Promise<void> {
    if (this.stopped && !keepalive) return;
    if (this.inflight && !keepalive) return;
    const watched = Math.min(3600, this.watched);
    this.watched = 0;
    const body = { session_id: this.sessionId, watched: playing ? watched : 0, playing };
    if (keepalive) {
      const token = api.session.token;
      void fetch("/api/v1/playback/heartbeat", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      }).catch(() => undefined);
      return;
    }
    this.inflight = true;
    try {
      const snapshot = await unwrap(api.POST("/api/v1/playback/heartbeat", { body }));
      this.absorb(snapshot);
    } catch (error) {
      if (error instanceof ApiError && error.code === "invalid_session") {
        const next = await this.handlers.renewSession();
        if (next) this.sessionId = next;
      } else {
        // Offline / server hiccup: keep the time for the next beat (the server still caps it).
        this.watched += watched;
      }
    } finally {
      this.inflight = false;
    }
  }

  private absorb(snapshot: UsageSnapshot): void {
    this.remainingAt = snapshot.exempt ? null : (snapshot.remaining_seconds ?? null);
    this.sinceSnapshot = 0;
    publishUsage(snapshot);
    this.handlers.onSnapshot(snapshot);
  }

  /** Leaving the player: report the last seconds even while the page unloads. */
  stop(): void {
    if (this.stopped) return;
    if (this.timer) clearInterval(this.timer);
    if (this.watched > 0.5) void this.beat(true, true);
    this.stopped = true;
  }
}
