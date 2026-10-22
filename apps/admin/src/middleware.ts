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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has("netfly_csrf_admin");
  if (!signedIn && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
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
