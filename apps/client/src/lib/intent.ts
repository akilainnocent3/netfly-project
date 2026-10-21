/**
 * "What the visitor wanted" when an action needed an account (Play, My List, Rate, Remind me).
 *
 * Stored in sessionStorage and mirrored in the `next` URL (for a different tab or a lost
 * session), both validated: the action is an enum, the slug a slug, numbers numbers, and
 * every path goes through safeNext. After login / signup / plan / payment the app resumes it.
 */
import { safeNext } from "./safe-next";

export type IntentAction = "play" | "my_list" | "rate" | "remind";

export interface Intent {
  action: IntentAction;
  slug: string;
  /** Title id (needed for My List / Rate / Remind). */
  titleId?: number;
  episode?: number | null;
  /** Rating value (-1 · 1 · 2). */
  value?: number;
  /** Display name for the confirmation toast. */
  name?: string;
  /** Page to come back to (and its scroll position). */
  path: string;
  scroll: number;
  at: number;
}

export const INTENT_KEY = "netfly-intent";
export const INTENT_PARAM = "intent";
const TTL_MS = 60 * 60_000;
const ACTIONS: IntentAction[] = ["play", "my_list", "rate", "remind"];
const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;

const int = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2 ** 31 ? v : undefined;

/** Validate anything that claims to be an intent (storage and URLs are user-controlled). */
export function cleanIntent(raw: unknown, now = Date.now()): Intent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const action = ACTIONS.find((a) => a === r.action);
  const slug = typeof r.slug === "string" && SLUG.test(r.slug) ? r.slug : null;
  if (!action || !slug) return null;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : now;
  if (now - at > TTL_MS || at - now > 60_000) return null;
  const titleId = int(r.titleId);
  if (action !== "play" && !titleId) return null;
  const value = r.value === -1 || r.value === 1 || r.value === 2 ? r.value : undefined;
  if (action === "rate" && value === undefined) return null;
  return {
    action,
    slug,
    titleId,
    episode: int(r.episode) ?? null,
    value,
    name:
      typeof r.name === "string" && r.name.trim()
        ? r.name.replace(/[\u0000-\u001f]/g, "").slice(0, 200)
        : undefined,
    path: safeNext(typeof r.path === "string" ? stripIntent(r.path) : null),
    scroll:
      typeof r.scroll === "number" && Number.isFinite(r.scroll)
        ? Math.max(0, Math.min(r.scroll, 1e6))
        : 0,
    at,
  };
}

export function watchPath(slug: string, episode?: number | null): string {
  return episode ? `/watch/${slug}?episode=${episode}` : `/watch/${slug}`;
}

/** `?intent=` value: action.slug.titleId[.value] — compact and easy to validate. */
export function encodeIntentParam(intent: Intent): string {
  return [intent.action, intent.slug, intent.titleId ?? 0, intent.value ?? ""]
    .join(".")
    .replace(/\.$/, "");
}

export function decodeIntentParam(raw: string | null, path: string): Intent | null {
  if (!raw || raw.length > 260) return null;
  const [action, slug, id, value] = raw.split(".");
  return cleanIntent({
    action,
    slug,
    titleId: Number(id),
    value: value === undefined || value === "" ? undefined : Number(value),
    path,
    scroll: 0,
  });
}

function stripIntent(path: string): string {
  const [base, query = ""] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete(INTENT_PARAM);
  const rest = params.toString();
  return rest ? `${base}?${rest}` : (base ?? "/");
}

/** Where to go after authenticating: Play goes straight to the player; the rest come back here. */
export function intentNext(intent: Intent): string {
  if (intent.action === "play") return watchPath(intent.slug, intent.episode);
  const path = stripIntent(intent.path);
  return safeNext(
    `${path}${path.includes("?") ? "&" : "?"}${INTENT_PARAM}=${encodeIntentParam(intent)}`,
  );
}

export function saveIntent(intent: Intent): void {
  try {
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* the `next` URL still carries it */
  }
}

export function readIntent(): Intent | null {
  try {
    return cleanIntent(JSON.parse(sessionStorage.getItem(INTENT_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function clearIntent(): void {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * The intent to resume on this page. `trusted` = it was stored by this tab before signing in,
 * so it may run by itself. A URL-only intent (another tab, or a link someone sent) must be
 * confirmed by the viewer: a crafted `?intent=` link can't add, rate or remind on their behalf.
 */
export function pendingIntent(location: {
  pathname: string;
  search: string;
}): { intent: Intent; trusted: boolean } | null {
  const params = new URLSearchParams(location.search);
  const here = stripIntent(`${location.pathname}${location.search}`);
  const stored = readIntent();
  const fromUrl = decodeIntentParam(params.get(INTENT_PARAM), here);
  // Same page = same pathname (the query may differ: e.g. ?translation= is added after load).
  if (stored && stored.action !== "play" && stored.path.split("?")[0] === location.pathname) {
    const matches =
      !fromUrl ||
      (fromUrl.action === stored.action &&
        fromUrl.slug === stored.slug &&
        fromUrl.titleId === stored.titleId);
    if (matches) return { intent: stored, trusted: true };
  }
  return fromUrl ? { intent: fromUrl, trusted: false } : null;
}
