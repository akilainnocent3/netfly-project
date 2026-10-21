import { ApiError, unwrap, type Schemas } from "@netfly/api-client";
import { api } from "./api";
import { publishUsage, type UsageSnapshot } from "./usage";

export type PlaybackInfo = Schemas["Playback"];

/** Playback info, or why there is none (`limit`: the viewing allowance is spent). */
export type PlaybackResult =
  { ok: true; info: PlaybackInfo } | { ok: false; limit: UsageSnapshot | null };

const cache = new Map<string, Promise<PlaybackResult>>();
const warmed = new Set<string>();

/** Playback info, memoised briefly so hover → click starts instantly. */
export function loadPlayback(
  slug: string,
  opts: { episode?: number | null; preview?: boolean; fresh?: boolean } = {},
): Promise<PlaybackResult> {
  const key = `${slug}:${opts.episode ?? ""}:${opts.preview ? "p" : "f"}`;
  let entry = opts.fresh ? undefined : cache.get(key);
  if (!entry) {
    entry = unwrap(
      api.GET("/api/v1/playback/{slug}", {
        params: {
          path: { slug },
          query: { episode: opts.episode ?? undefined, preview: opts.preview || undefined },
        },
      }),
    ).then(
      (info): PlaybackResult => ({ ok: true, info }),
      (error): PlaybackResult => {
        // Never remember a refusal: the limit resets, or staff add minutes.
        cache.delete(key);
        if (error instanceof ApiError && error.code === "usage_limit_reached") {
          const usage = (error.body.usage ?? null) as UsageSnapshot | null;
          if (usage) publishUsage(usage);
          return { ok: false, limit: usage };
        }
        return { ok: false, limit: null };
      },
    );
    cache.set(key, entry);
    setTimeout(() => cache.get(key) === entry && cache.delete(key), 4 * 60_000);
  }
  return entry;
}

/** Playback info or null (warming, previews). */
export function getPlayback(
  slug: string,
  opts: { episode?: number | null; preview?: boolean } = {},
): Promise<PlaybackInfo | null> {
  return loadPlayback(slug, opts).then((r) => (r.ok ? r.info : null));
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
