# Decisions

Ambiguities in the build brief, the option chosen, and why.

## Platform & configuration

1. **Amazon S3 instead of MinIO for local development.** The operator chose Amazon S3. There is no local
   S3 container; bucket, region, keys, prefix and CDN live in the database (`storage.*`) and are entered in
   *Admin → Settings → Storage & CDN* with a **Test connection** button. Until a bucket is configured the
   platform boots and everything except media upload/playback works. A custom endpoint
   (`storage.s3.endpoint_url`) still allows any S3-compatible store.
2. **Exactly four backend env vars** (`DATABASE_URL`, `REDIS_URL`, `DJANGO_SECRET_KEY`,
   `CONFIG_ENCRYPTION_KEY`). Things Django normally reads from settings at import time are re-implemented
   as config-driven middleware so they change live: allowed hosts, CORS, HSTS/SSL redirect, rate limits,
   JWT lifetimes. `DEBUG` is always `False` (JSON error pages only).
3. **Frontends need one bootstrap value**, `NETFLY_API_URL` (where the API is, server side). A browser app
   cannot read the database, so this is the frontend equivalent of `DATABASE_URL`. Browsers always call
   the API same-origin through a Next.js rewrite (`/api/*`), so cookies and CSRF stay first-party.
4. **Config propagation.** One snapshot of the config table lives in Redis; each process memoises it and
   re-checks a version counter at most once per second. Saving a value bumps the version from a
   `post_save` signal, so web processes and Celery workers see changes within ~1 s with no restart.
   Missing keys fall back to the registry defaults in `apps/core/config_defaults.py`.
5. **Secrets** are Fernet-encrypted in `ConfigEntry.encrypted_value`, never serialised, and audit-logged as
   "changed (secret)". A wrong `CONFIG_ENCRYPTION_KEY` makes secrets read as "not configured" instead of
   crashing.

## Auth

6. **Access token in memory, refresh token in an httpOnly cookie.** The access JWT (`auth.access_token_minutes`)
   is returned in the body and kept in JS memory (sent as `Bearer`, so ordinary API calls need no CSRF).
   The opaque refresh token (only its SHA-256 is stored) is an httpOnly `Secure` `SameSite=Lax` cookie
   scoped to `/api/v1/auth`. Refresh and logout are CSRF-protected with a double-submit cookie.
   Rotation on every refresh; replaying a rotated token revokes the whole token family.
7. **Separate sessions per app.** Cookies are suffixed `_client` / `_admin`, so a staff member can be
   signed in to the viewer app and the studio as different accounts on the same domain.
8. **Login auto-submit requires the password to reach the configured minimum length.** No valid
   password is shorter, so auto-submit never spends a lockout attempt on a half-typed password.
9. **Password change bumps `token_version`**, invalidating every outstanding access token immediately.

## Media

10. **Time-bucketed signed URLs.** Signed S3 GET URLs are produced by a small SigV4 presigner whose signing
    time is rounded down (to ttl/4). The same object yields the same URL for a while, so browsers and the
    CDN can cache segments and images even though every URL is signed and short-lived. A test checks
    the signatures against botocore's.
11. **Images through a cached redirect.** Images are re-encoded server-side at fixed widths. Next/Image uses
    a custom loader that points at `/api/v1/img/<key>/w<width>`, which 302-redirects (cacheable) to the
    signed S3/CDN URL. This keeps buckets private (S3 Block Public Access stays on) and needs no
    build-time image domain configuration, because the domain is DB config.

## Product & UX

13. **Admin tables use page numbers; viewer feeds use cursors.** Staff need totals and page jumps; viewers get
    opaque cursors (`browse/home`, genre grids).
14. **"Create title" is an explicit action** (Enter/button), not auto-submit — it creates a record. Search,
    filters and settings fields auto-apply / save on blur as specified; the title editor autosaves every 1.5 s.
15. **Cards are 16:9 backdrops with logo art**; Top 10 uses 2:3 posters next to the numerals.
16. **Hover previews and the hero play the trailer, or a 720p-capped slice of the title** starting at 15 % when no
    trailer exists; disabled by the viewer's "Autoplay previews", `prefers-reduced-motion` and Save-Data.
17. **Completion follows the latest position** (≥ `playback.completed_ratio`); rewatching reopens a title.
    Only *finishing* something busts the recommendation cache — routine progress saves don't.
18. **"Because you liked X" needs ≥ 2 candidates** so small catalogs still get the row.
19. **Search logs collapse typing**: consecutive prefixes / typo corrections within 30 s update one row.
20. **The viewer's translation mode is resolved server-side from a cookie** (then URL → local storage →
    account → default on the client) so the hero renders in the right mode on first paint.
21. **Upload resume after refresh** works by re-selecting the same file: the fingerprint (name+size+mtime)
    finds the open multipart upload and only missing parts are sent. Browsers can't reopen a file by
    themselves, so the UI says "Select <file> again to resume".
22. **Charts** use one hue per measure and never dual axes (startup time and rebuffers are separate charts).

## Status at hand-off

* **Performance:** Lighthouse mobile (simulated 4G) on the signed-in home page measured **83–87 performance,
  100 accessibility, 96 best practices, CLS 0**, on a 2-vCPU sandbox shared with the API, both apps and Chrome.
  Unthrottled LCP is ~0.2 s. The ≥ 90 target is **not yet confirmed**; the remaining cost is JS before first
  paint (~230 KB). Next steps: measure on dedicated hardware, split TanStack Query/Radix out of the
  first-paint path further, and server-render the first rows.
* **Playback end-to-end** is covered by backend tests (real FFmpeg transcode on mocked S3, signed playlists)
  and Playwright specs that run once media exists; they skip until S3 is configured.

## Local development (this repository's sandbox)

12. The sandbox used to build this project blocks container-to-container traffic on Docker bridge networks,
    so verification ran backend containers with host networking. `docker-compose.yml` itself is standard
    and unaffected.
