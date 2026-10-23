import { NextResponse, type NextRequest } from "next/server";
import { matchesPath, NOINDEX_PATHS, PRIVATE_PATHS } from "@/lib/routes";
import { safeNext } from "@/lib/safe-next";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

let mediaOrigins: { value: string; at: number } = { value: "", at: 0 };

/** Media origins (S3 / CDN) come from DB config, cached here for 60 s. */
async function getMediaOrigins(): Promise<string> {
  if (Date.now() - mediaOrigins.at < 60_000) return mediaOrigins.value;
  try {
    const res = await fetch(`${API}/api/public/config`, { cache: "no-store" });
    const body = (await res.json()) as { values: Record<string, unknown> };
    const origins = body.values["media_origins"];
    mediaOrigins = { value: Array.isArray(origins) ? origins.join(" ") : "", at: Date.now() };
  } catch {
    mediaOrigins = { value: mediaOrigins.value, at: Date.now() - 50_000 };
  }
  return mediaOrigins.value;
}

// Next's middleware adapter rejects a relative Location and builds request.url from the standalone
// server's bind address (localhost:PORT), so resolve redirects against the public host nginx
// forwards instead. The server only listens on 127.0.0.1, so these headers come from nginx.
function redirectTo(request: NextRequest, pathWithQuery: string) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const origin = host ? `${proto || "http"}://${host}` : request.url;
  return NextResponse.redirect(new URL(pathWithQuery, origin));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has("netfly_csrf_client");
  // Browsing is open to everyone; only account pages (and the player) need a session.
  if (!signedIn && matchesPath(pathname, PRIVATE_PATHS)) {
    return redirectTo(request, `/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && pathname.startsWith("/genre/")) {
    return redirectTo(request, pathname.replace(/^\/genre\//, "/categories/") + search);
  }
  // The A–Z catalogue is a crawl path; signed-in viewers browse the app's categories instead.
  if (signedIn && pathname === "/titles") return redirectTo(request, "/categories");
  const signupStep = /^\/signup(\/(name|username|password))?$/.test(pathname);
  if (signedIn && (pathname === "/login" || signupStep || pathname === "/")) {
    // Already signed in: go where the visitor was headed (validated), else home.
    const target = safeNext(request.nextUrl.searchParams.get("next"));
    return redirectTo(request, target);
  }

  const nonce = btoa(crypto.randomUUID());
  const media = await getMediaOrigins();
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${media}`,
    `media-src 'self' blob: ${media}`,
    `connect-src 'self' ${media}${dev ? " ws:" : ""}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Belt and braces next to robots.txt: private pages must never show up in search results.
  if (matchesPath(pathname, NOINDEX_PATHS))
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|brand/|manifest\\.webmanifest).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
