import type Hls from "hls.js";
import type { ErrorData, Level } from "hls.js";

export type QualityPref = "auto" | "data_saver" | `${number}`;

export interface EngineOptions {
  src: string;
  startAt: number;
  defaultEstimate: number;
  bandwidthFactor: number;
  bandwidthUpFactor: number;
  maxBuffer: number;
  backBuffer: number;
  dataSaverMaxHeight: number;
  quality: QualityPref;
  /** A fresh manifest URL when the signed one expires (403). */
  refreshSource: () => Promise<string | null>;
  onLevels: (levels: LevelInfo[]) => void;
  onLevelSwitched: (level: LevelInfo | null, auto: boolean) => void;
  onFatal: (message: string) => void;
  onTracks: (tracks: { subtitles: TrackInfo[]; audio: TrackInfo[] }) => void;
}

export interface TrackInfo {
  id: number;
  label: string;
  lang: string;
}

export interface LevelInfo {
  index: number;
  height: number;
  width: number;
  bitrate: number;
}

const BW_KEY = "netfly-bandwidth";
const HEADROOM = 1.15;

export function storedBandwidth(): number | null {
  try {
    const value = Number(localStorage.getItem(BW_KEY));
    return Number.isFinite(value) && value > 100_000 ? value : null;
  } catch {
    return null;
  }
}

function storeBandwidth(bps: number) {
  try {
    if (Number.isFinite(bps) && bps > 100_000) localStorage.setItem(BW_KEY, String(Math.round(bps)));
  } catch {
    /* ignore */
  }
}

function toInfo(level: Level, index: number): LevelInfo {
  return { index, height: level.height, width: level.width, bitrate: level.bitrate };
}

/**
 * hls.js wrapper tuned to start sharp and stay sharp:
 * - starts on the highest rung the last known bandwidth can sustain (not the lowest);
 * - biases ABR upward, switches down conservatively, buffers generously;
 * - recovers from network/media errors silently, refreshing expired signed URLs.
 * Safari/iOS uses native HLS (same signed manifest).
 */
export class PlaybackEngine {
  hls: Hls | null = null;
  native = false;
  private video: HTMLVideoElement;
  private opts: EngineOptions;
  private recoveries = 0;
  private lastRecovery = 0;
  private bwTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(video: HTMLVideoElement, opts: EngineOptions) {
    this.video = video;
    this.opts = opts;
  }

  async start(): Promise<void> {
    const { default: HlsCtor } = await import("hls.js");
    if (this.destroyed) return;
    if (!HlsCtor.isSupported()) {
      if (this.video.canPlayType("application/vnd.apple.mpegurl")) {
        this.native = true;
        this.video.src = this.opts.src;
        this.video.addEventListener("loadedmetadata", () => {
          if (this.opts.startAt > 0) this.video.currentTime = this.opts.startAt;
        }, { once: true });
        return;
      }
      this.opts.onFatal("This browser can't play adaptive video.");
      return;
    }
    const estimate = storedBandwidth() ?? this.opts.defaultEstimate;
    const hls = new HlsCtor({
      autoStartLoad: false,
      startPosition: this.opts.startAt,
      abrEwmaDefaultEstimate: estimate,
      abrBandWidthFactor: this.opts.bandwidthFactor,
      abrBandWidthUpFactor: this.opts.bandwidthUpFactor,
      abrEwmaFastVoD: 3,
      abrEwmaSlowVoD: 9,
      maxBufferLength: this.opts.maxBuffer,
      maxMaxBufferLength: Math.max(this.opts.maxBuffer * 2, 120),
      backBufferLength: this.opts.backBuffer,
      maxBufferHole: 0.5,
      capLevelOnFPSDrop: true,
      capLevelToPlayerSize: false,
      startFragPrefetch: true,
      testBandwidth: true,
      enableWorker: true,
      fragLoadPolicy: { default: { maxTimeToFirstByteMs: 8000, maxLoadTimeMs: 20000, timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 }, errorRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 8000, backoff: "exponential" } } },
    });
    this.hls = hls;

    hls.on(HlsCtor.Events.MANIFEST_PARSED, (_e, data) => {
      const levels = data.levels.map(toInfo);
      this.opts.onLevels(levels);
      hls.startLevel = this.pickStartLevel(levels, estimate);
      this.applyQuality(this.opts.quality);
      hls.startLoad(this.opts.startAt);
    });
    hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_e, data) => {
      const level = hls.levels[data.level];
      this.opts.onLevelSwitched(level ? toInfo(level, data.level) : null, hls.autoLevelEnabled);
    });
    hls.on(HlsCtor.Events.ERROR, (_e, data) => void this.onError(data, HlsCtor));
    const syncTracks = () =>
      this.opts.onTracks({
        subtitles: hls.subtitleTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Track ${i + 1}`, lang: t.lang ?? "" })),
        audio: hls.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Audio ${i + 1}`, lang: t.lang ?? "" })),
      });
    hls.on(HlsCtor.Events.SUBTITLE_TRACKS_UPDATED, syncTracks);
    hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, syncTracks);
    hls.loadSource(this.opts.src);
    hls.attachMedia(this.video);
    this.bwTimer = setInterval(() => storeBandwidth(hls.bandwidthEstimate), 5000);
  }

  /** Highest rung whose bitrate (with headroom) fits the estimate, within the quality preference. */
  private pickStartLevel(levels: LevelInfo[], estimate: number): number {
    const cap = this.capHeight(this.opts.quality);
    const candidates = levels.filter((l) => !cap || l.height <= cap).sort((a, b) => b.bitrate - a.bitrate);
    const fit = candidates.find((l) => l.bitrate * HEADROOM <= estimate) ?? candidates[candidates.length - 1];
    return fit?.index ?? -1;
  }

  private capHeight(pref: QualityPref): number | null {
    if (pref === "data_saver") return this.opts.dataSaverMaxHeight;
    if (pref === "auto") return null;
    return Number(pref) || null;
  }

  /** Auto = full ABR; data saver = ABR capped; a height = locked to the closest rung at or below it. */
  applyQuality(pref: QualityPref): void {
    this.opts.quality = pref;
    const hls = this.hls;
    if (!hls || !hls.levels.length) return;
    if (pref === "auto") {
      hls.autoLevelCapping = -1;
      hls.currentLevel = -1;
      return;
    }
    const cap = this.capHeight(pref) ?? Infinity;
    const allowed = hls.levels.map((l, i) => ({ h: l.height, b: l.bitrate, i })).filter((l) => l.h <= cap).sort((a, b) => b.h - a.h || b.b - a.b);
    const best = allowed[0] ?? hls.levels.map((l, i) => ({ h: l.height, b: l.bitrate, i })).sort((a, b) => a.h - b.h)[0];
    if (!best) return;
    if (pref === "data_saver") {
      hls.autoLevelCapping = best.i;
      hls.currentLevel = -1;
    } else {
      hls.autoLevelCapping = -1;
      hls.currentLevel = best.i; // immediate switch, flushes forward buffer
    }
  }

  get bandwidth(): number {
    return this.hls?.bandwidthEstimate ?? 0;
  }

  private async onError(data: ErrorData, HlsCtor: typeof Hls): Promise<void> {
    const hls = this.hls;
    if (!hls || !data.fatal) return;
    const now = Date.now();
    if (now - this.lastRecovery > 60_000) this.recoveries = 0;
    this.lastRecovery = now;
    this.recoveries += 1;
    if (this.recoveries > 6) {
      this.opts.onFatal("Playback stopped because of repeated network errors.");
      return;
    }
    const status = (data.response as { code?: number } | undefined)?.code;
    if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
      if (status === 403 || status === 401) {
        // Signed URL expired: get a fresh one and continue from the same spot.
        const fresh = await this.opts.refreshSource();
        if (fresh) {
          const at = this.video.currentTime;
          hls.loadSource(fresh);
          hls.startLoad(at);
          return;
        }
      }
      setTimeout(() => hls.startLoad(), Math.min(8000, 500 * 2 ** this.recoveries));
    } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
      if (this.recoveries === 2) hls.swapAudioCodec();
      hls.recoverMediaError();
    } else {
      this.opts.onFatal("Something went wrong while playing this video.");
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.bwTimer) clearInterval(this.bwTimer);
    if (this.hls) storeBandwidth(this.hls.bandwidthEstimate);
    this.hls?.destroy();
    this.hls = null;
  }
}
