import { NextResponse, type NextRequest } from "next/server";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";
let mediaOrigins = { value: "", at: 0 };

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
  const signedIn = request.cookies.has("netfly_csrf_admin");
  if (!signedIn && pathname !== "/login") {
    const query = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return redirectTo(request, `/login${query}`);
  }
  const nonce = btoa(crypto.randomUUID());
  const media = await getMediaOrigins();
  const dev = process.env.NODE_ENV !== "production";
  // Uploads PUT straight to S3, so the bucket origin is allowed in connect-src.
  const s3 = "https://*.amazonaws.com";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${media} ${s3}`,
    `media-src 'self' blob: ${media} ${s3}`,
    `connect-src 'self' ${media} ${s3}${dev ? " ws:" : ""}`,
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
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|brand/).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
