import { unwrap } from "@netfly/api-client";
import { api } from "./api";

export type UploadState = "preparing" | "uploading" | "paused" | "completing" | "done" | "error";

export interface UploadCallbacks {
  onProgress: (loaded: number, total: number) => void;
  onState: (state: UploadState, error?: string) => void;
}

const CONCURRENCY = 4;
const SIGN_BATCH = 20;
const MAX_ATTEMPTS = 5;

export function fingerprintOf(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Browser → S3 multipart upload. Parts go straight to S3 on presigned URLs, in
 * parallel, each retried with backoff. Re-selecting the same file after a page
 * refresh resumes: the server returns the parts S3 already has.
 */
export class MultipartUpload {
  private paused = false;
  private aborted = false;
  private sessionId: string | null = null;
  private etags = new Map<number, string>();
  private partLoaded = new Map<number, number>();
  private urls = new Map<number, string>();
  private inflight = new Set<XMLHttpRequest>();
  private wake: (() => void) | null = null;
  assetId: string | null = null;

  constructor(
    readonly file: File,
    readonly kind: "feature" | "episode" | "trailer",
    private readonly cb: UploadCallbacks,
  ) {}

  async start(): Promise<string> {
    this.cb.onState("preparing");
    const session = await unwrap(
      api.POST("/api/v1/admin/uploads", {
        body: {
          filename: this.file.name,
          size: this.file.size,
          content_type: this.file.type,
          kind: this.kind,
          fingerprint: fingerprintOf(this.file),
        },
      }),
    );
    this.sessionId = session.id;
    this.assetId = session.asset_id;
    for (const part of session.completed_parts) {
      this.etags.set(part.number, part.etag);
      this.partLoaded.set(part.number, part.size ?? session.part_size);
    }
    this.report();

    const pending = Array.from({ length: session.part_count }, (_, i) => i + 1).filter((n) => !this.etags.has(n));
    this.cb.onState("uploading");
    const queue = [...pending];
    const worker = async () => {
      while (queue.length && !this.aborted) {
        await this.waitIfPaused();
        const number = queue.shift();
        if (number === undefined) return;
        await this.uploadPart(number, session.part_size, session.part_count);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length || 1) }, worker));
    if (this.aborted) throw new Error("Upload cancelled");

    this.cb.onState("completing");
    const parts = [...this.etags.entries()].map(([number, etag]) => ({ number, etag }));
    await unwrap(api.POST("/api/v1/admin/uploads/{id}/complete", { params: { path: { id: session.id } }, body: { parts } }));
    this.cb.onState("done");
    return session.asset_id;
  }

  pause(): void {
    this.paused = true;
    for (const xhr of this.inflight) xhr.abort();
    this.cb.onState("paused");
  }

  resume(): void {
    this.paused = false;
    this.cb.onState("uploading");
    this.wake?.();
  }

  async abort(): Promise<void> {
    this.aborted = true;
    for (const xhr of this.inflight) xhr.abort();
    this.wake?.();
    if (this.sessionId) await api.DELETE("/api/v1/admin/uploads/{id}", { params: { path: { id: this.sessionId } } });
  }

  private waitIfPaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve) => {
      this.wake = () => {
        this.wake = null;
        resolve();
      };
    });
  }

  private async signedUrl(number: number, count: number): Promise<string> {
    const cached = this.urls.get(number);
    if (cached) return cached;
    const numbers = Array.from({ length: SIGN_BATCH }, (_, i) => number + i).filter((n) => n <= count && !this.etags.has(n));
    const signed = await unwrap(api.POST("/api/v1/admin/uploads/{id}/sign", { params: { path: { id: this.sessionId! } }, body: { numbers } }));
    for (const s of signed) this.urls.set(s.number, s.url);
    return this.urls.get(number)!;
  }

  private async uploadPart(number: number, partSize: number, count: number): Promise<void> {
    const blob = this.file.slice((number - 1) * partSize, Math.min(number * partSize, this.file.size));
    for (let attempt = 1; ; attempt++) {
      await this.waitIfPaused();
      if (this.aborted) return;
      try {
        const etag = await this.put(await this.signedUrl(number, count), blob, number);
        this.etags.set(number, etag);
        this.partLoaded.set(number, blob.size);
        this.report();
        return;
      } catch (error) {
        if (this.paused || this.aborted) continue;
        this.partLoaded.set(number, 0);
        this.urls.delete(number); // the URL may have expired
        if (attempt >= MAX_ATTEMPTS) {
          this.cb.onState("error", error instanceof Error ? error.message : "Upload failed");
          throw error;
        }
        await new Promise((r) => setTimeout(r, Math.min(15_000, 500 * 2 ** attempt)));
      }
    }
  }

  private put(url: string, blob: Blob, number: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.inflight.add(xhr);
      xhr.open("PUT", url);
      xhr.upload.onprogress = (e) => {
        this.partLoaded.set(number, e.loaded);
        this.report();
      };
      xhr.onload = () => {
        this.inflight.delete(xhr);
        const etag = xhr.getResponseHeader("ETag");
        if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
        else reject(new Error(etag ? `S3 returned ${xhr.status}` : "S3 didn't return an ETag — apply CORS in Settings → Storage"));
      };
      xhr.onerror = () => {
        this.inflight.delete(xhr);
        reject(new Error("Network error"));
      };
      xhr.onabort = () => {
        this.inflight.delete(xhr);
        reject(new Error("aborted"));
      };
      xhr.send(blob);
    });
  }

  private report(): void {
    let loaded = 0;
    for (const v of this.partLoaded.values()) loaded += v;
    this.cb.onProgress(Math.min(loaded, this.file.size), this.file.size);
  }
}
