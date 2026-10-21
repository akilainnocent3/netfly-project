import createClient, { type Client } from "openapi-fetch";
import type { components, paths } from "./schema";

export type { components, paths } from "./schema";
export type Schemas = components["schemas"];
export type User = Schemas["User"];
export type SessionPayload = Schemas["Session"];
export type AppName = "client" | "admin";

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

/** Human messages for failures that never reached the API (proxy errors, timeouts, HTML pages). */
export function fallbackMessage(status: number): string {
  if (status === 0) return "You're offline. Check your connection.";
  if (status === 401) return "Your session has ended. Please sign in again.";
  if (status === 403) return "You don't have access to that.";
  if (status === 404) return "We couldn't find that.";
  if (status === 408 || status === 504) return "That took too long. Please try again.";
  if (status === 413) return "That file is too large.";
  if (status === 429) return "You're going a little fast. Wait a moment and try again.";
  if (status === 502 || status === 503)
    return "We're having trouble connecting. Please try again shortly.";
  return "Something went wrong on our side. Please try again.";
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  /** The whole error body: some errors carry context next to {code, message} (e.g. `usage`). */
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Partial<ApiErrorBody> | undefined) {
    super(body?.message ?? fallbackMessage(status));
    this.status = status;
    this.code = body?.code ?? "error";
    this.fields = body?.fields ?? {};
    this.body = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  }
}

type Listener = (user: User | null) => void;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Holds the short-lived access token in memory only. The refresh token lives
 * in an httpOnly cookie; refreshes are single-flight and CSRF protected with a
 * double-submit token.
 */
export class SessionManager {
  private access: string | null = null;
  private expiresAt = 0;
  private user: User | null = null;
  private inflight: Promise<boolean> | null = null;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Active viewer profile (sent as `X-Profile`; ignored by the API unless profiles are on). */
  profileId: number | null = null;

  constructor(
    private readonly baseUrl: string,
    readonly app: AppName,
  ) {}

  get token(): string | null {
    return this.access;
  }

  get currentUser(): User | null {
    return this.user;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSession(payload: SessionPayload): void {
    this.access = payload.access;
    this.expiresAt = Date.now() + payload.expires_in * 1000;
    this.user = payload.user;
    this.schedule();
    this.emit();
  }

  updateUser(user: User): void {
    this.user = user;
    this.emit();
  }

  clear(): void {
    this.access = null;
    this.user = null;
    this.profileId = null;
    this.expiresAt = 0;
    if (this.timer) clearTimeout(this.timer);
    this.emit();
  }

  /** A refresh cookie exists, so a session can be restored before the first request. */
  canRestore(): boolean {
    return !this.access && !!readCookie(`netfly_csrf_${this.app}`);
  }

  isFresh(): boolean {
    return !!this.access && Date.now() < this.expiresAt - 30_000;
  }

  /** Exchange the refresh cookie for a new access token. Returns false if logged out. */
  refresh(): Promise<boolean> {
    if (!this.inflight) {
      this.inflight = this.doRefresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  csrfHeader(): Record<string, string> {
    const csrf = readCookie(`netfly_csrf_${this.app}`);
    return csrf ? { "X-CSRF-Token": csrf } : {};
  }

  private async doRefresh(): Promise<boolean> {
    if (!readCookie(`netfly_csrf_${this.app}`)) {
      this.clear();
      return false;
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...this.csrfHeader() },
        body: JSON.stringify({ app: this.app }),
      });
      if (!response.ok) {
        this.clear();
        return false;
      }
      this.setSession((await response.json()) as SessionPayload);
      return true;
    } catch {
      // Offline: keep whatever we have; callers will surface the network error.
      return !!this.access;
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    if (typeof window === "undefined") return;
    const delay = Math.max(5_000, this.expiresAt - Date.now() - 60_000);
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.user);
  }
}

export type NetflyClient = Client<paths> & { session: SessionManager };

/** Typed API client. In the browser `baseUrl` is "" (same-origin proxy). */
export function createNetflyClient(options: {
  baseUrl: string;
  app: AppName;
  session?: SessionManager;
}): NetflyClient {
  const session = options.session ?? new SessionManager(options.baseUrl, options.app);

  const authFetch = async (input: Request): Promise<Response> => {
    const retry = input.clone();
    const withAuth = (request: Request): Request => {
      if (session.token && !request.headers.has("Authorization")) {
        request.headers.set("Authorization", `Bearer ${session.token}`);
      }
      if (session.profileId != null && !request.headers.has("X-Profile")) {
        request.headers.set("X-Profile", String(session.profileId));
      }
      return request;
    };
    // On a fresh page load, restore the session first so early requests aren't anonymous.
    if (session.canRestore() || (session.token && !session.isFresh())) await session.refresh();
    let response = await fetch(withAuth(input));
    if (response.status === 401 && session.token) {
      if (await session.refresh()) {
        retry.headers.delete("Authorization");
        response = await fetch(withAuth(retry));
      }
    }
    return response;
  };

  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: "include",
    fetch: authFetch,
  });
  return Object.assign(client, { session });
}

/** Unwrap an openapi-fetch result or throw a typed ApiError. */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await promise;
  } catch {
    throw new ApiError(0, { code: "network", message: "You're offline. Check your connection." });
  }
  if (!result.response.ok) {
    throw new ApiError(result.response.status, result.error as Partial<ApiErrorBody> | undefined);
  }
  return result.data as T;
}
