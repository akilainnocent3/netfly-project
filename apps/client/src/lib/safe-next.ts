const BASE = "https://netfly.invalid";

/**
 * Only allow same-site relative redirects (after login, signup, payment…).
 * Rejects absolute and protocol-relative URLs, backslash tricks (`/\evil.com`,
 * which browsers treat as `//evil.com`), control characters and oversized values.
 */
export function safeNext(value: string | null | undefined, fallback = "/browse"): string {
  if (!value || value.length > 2048) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value))
    return fallback;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
