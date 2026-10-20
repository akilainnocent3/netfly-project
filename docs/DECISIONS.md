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

## Local development (this repository's sandbox)

12. The sandbox used to build this project blocks container-to-container traffic on Docker bridge networks,
    so verification ran backend containers with host networking. `docker-compose.yml` itself is standard
    and unaffected.
