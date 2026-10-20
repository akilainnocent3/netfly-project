import { unwrap, type Schemas } from "@netfly/api-client";
import { api } from "./api";

export type PlaybackInfo = Schemas["Playback"];

const cache = new Map<string, Promise<PlaybackInfo | null>>();
const warmed = new Set<string>();

/** Playback info, memoised briefly so hover → click starts instantly. */
export function getPlayback(slug: string, opts: { episode?: number | null; preview?: boolean } = {}): Promise<PlaybackInfo | null> {
  const key = `${slug}:${opts.episode ?? ""}:${opts.preview ? "p" : "f"}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = unwrap(
      api.GET("/api/v1/playback/{slug}", {
        params: { path: { slug }, query: { episode: opts.episode ?? undefined, preview: opts.preview || undefined } },
      }),
    ).catch(() => null);
    cache.set(key, entry);
    setTimeout(() => cache.delete(key), 4 * 60_000);
  }
  return entry;
}

/** Warm the HTTP cache with the master + top rendition playlists so playback starts at once. */
export function warmManifest(info: PlaybackInfo | null): void {
  if (!info || warmed.has(info.master_url)) return;
  warmed.add(info.master_url);
  void fetch(info.master_url, { credentials: "same-origin" })
    .then((r) => (r.ok ? r.text() : ""))
    .then((text) => {
      const first = text.split("\n").find((line) => line && !line.startsWith("#"));
      if (first) void fetch(new URL(first, new URL(info.master_url, location.href)).toString());
    })
    .catch(() => undefined);
}
