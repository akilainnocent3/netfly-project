/**
 * When a loader is on screen, framework-free so it can be unit-tested with a fake clock.
 *
 * - `delay`: nothing shows if the work finishes sooner (fast loads show nothing);
 * - `minDuration`: once shown, the loader stays at least this long (it never blinks);
 * - `exit`: then it fades out for this long before it is removed.
 */
export type LoaderPhase = "hidden" | "visible" | "exiting";

export interface LoaderTiming {
  delay?: number;
  minDuration?: number;
  exit?: number;
}

export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class LoaderTimeline {
  phase: LoaderPhase = "hidden";
  private shownAt = 0;
  private timer: unknown = null;
  private readonly delay: number;
  private readonly minDuration: number;
  private readonly exit: number;

  constructor(
    private readonly onChange: (phase: LoaderPhase) => void,
    { delay = 200, minDuration = 400, exit = 150 }: LoaderTiming = {},
    private readonly clock: Scheduler = realScheduler,
  ) {
    this.delay = delay;
    this.minDuration = minDuration;
    this.exit = exit;
  }

  /** Report whether the work is still in progress. */
  set(active: boolean): void {
    // Already fading out: let the fade finish.
    if (!active && this.phase === "exiting") return;
    this.cancel();
    if (active) {
      if (this.phase === "exiting") this.go("visible");
      if (this.phase === "hidden") {
        this.timer = this.clock.setTimeout(() => {
          this.shownAt = this.clock.now();
          this.go("visible");
        }, this.delay);
      }
      return;
    }
    if (this.phase !== "visible") return;
    const remaining = Math.max(0, this.minDuration - (this.clock.now() - this.shownAt));
    this.timer = this.clock.setTimeout(() => {
      this.go("exiting");
      this.timer = this.clock.setTimeout(() => this.go("hidden"), this.exit);
    }, remaining);
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private go(phase: LoaderPhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    this.onChange(phase);
  }
}
