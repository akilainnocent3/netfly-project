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
8. **No form submits itself.** Login, sign-up and password change submit only on the button or Enter
   (live validation and the username availability check stay). Auto-submit could save a half-typed
   password and sign every device out; `useAutoSubmit` and `ux.autosubmit_delay_ms` were removed.
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
    Previews and the player both use hls.js wherever MSE exists and native HLS only as a fallback
    (iOS): desktop Chrome now also claims native HLS support, and asking that first stalled previews.

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

## Recommendations: priority, dedupe, caching

23. **Recommendation priority is a per-title `boost` (−2…+5) with an optional campaign window.** Outside
    `boost_starts_at`/`boost_ends_at` it counts as 0 (`Title.effective_boost(now)`). The engine adds
    `recommendations.weight_boost × boost` to both the cold-start and the personalised score, pins up to
    `recommendations.boost_pin_top_picks` positively boosted titles into the first Top picks slots (never
    a completed or disliked one), uses boost as a secondary sort in genre rows / new releases, and orders
    the billboard by Billboard rows → effective boost → featured → trending. **Top 10 and Trending ignore
    boost** — they are claims about what people watch, and boosting them would make them untrue.
    Boost changes are audit-logged.
24. **Cold start is popularity-led, not random:** `cold_start_popularity × popularity/max + featured + new +
    boost + 0.35 × daily-stable noise`. Noise is seeded per viewer per day (`engine._daily_rng`), so a
    viewer's rows are stable within a day and rotate across days; the same applies to the "Hidden gems",
    "Something different" and "You might have missed" rows, which are now real queries.
25. **Dislikes are excluded from every row and the billboard**; Continue Watching is the only exception
    (the viewer is mid-way through it).
26. **Cross-row de-duplication:** a title appears in at most `recommendations.row_dedupe_window` rows per
    home page. Continue Watching, My List and Top 10 are exempt (they are lists the viewer recognises),
    and dedupe never shrinks a row below 4 items.
27. **A global catalog version instead of TTL waits.** Every per-viewer feed key and the billboard key
    include `recs:catalog:v`, bumped on commit of any admin write that changes what viewers should see
    (title status/featured/boost/genres/publish, related titles, collections, home rows, billboard,
    genres). Admin edits show up on the next request instead of after `recommendations.cache_seconds`.
    Old keys simply expire.

## Profiles

28. **Profiles are behind `features.profiles_enabled` (default off).** When on, an account has up to
    `features.max_profiles` (5) `ViewerProfile`s; the client sends `X-Profile`, the API resolves a
    `Viewer(user, profile)` and **every** engagement row (progress, ratings, My List, reminders) and every
    recommendation cache key is scoped to it. Profile endpoints only ever query `request.user`'s profiles
    (another account's id is a 404). Kids profiles filter to `content.kids_ratings` everywhere, including
    deep links.

## Search engines (SEO)

29. **The app is not a client-only SPA for crawlers.** Every content route used to redirect signed-out
    visitors to /login, so search engines saw a login form. Signed-out visitors now get server-rendered
    public pages — the landing page (`/`), title pages (`/title/<slug>`, same URL as the in-app deep link)
    and genre pages (`/genre/<slug>`) — with real HTML content, canonical URLs, Open Graph/Twitter cards
    and JSON-LD (`Movie`/`TVSeries`, `BreadcrumbList`, `ItemList`, `Organization`/`WebSite`/`FAQPage`).
    Signed-in viewers keep the app experience on the same URLs (modal over the feed; `/genre` →
    `/categories`).
30. **`robots.txt` and `sitemap.xml` are generated from the catalog** (`/api/v1/public/sitemap`, cached under
    the catalog version, so publishing shows up immediately). App routes are disallowed and also send
    `X-Robots-Tag: noindex`; `/api/v1/img/` stays crawlable for images. Unknown titles return a real 404.
    `seo.indexing_enabled = false` turns everything to `noindex` + `Disallow: /` for staging.
31. **Public pages use plain `<a>` links for titles and genres.** `/title/*` lives beside an intercepting
    route (`(.)title`) that opens the in-app modal; full document loads keep signed-out navigation on the
    public pages. For the same reason the translation mode is reflected in the URL with
    `history.replaceState`, not `router.replace` (a soft navigation re-ran the interceptor and mounted a
    second title modal on deep links).

53. **`/titles` is the crawlable A–Z catalogue.** A server-rendered, plain-link list of every published
    title (`/api/v1/public/catalog`, 60 per page, cached under the catalog version) with real `<a>`
    pagination, a letter index, its own metadata and `ItemList` JSON-LD. It is linked from the landing
    page and the public footer, listed in the sitemap (every page), and signed-in viewers are redirected to
    `/categories` (like `/genre`). Every title is therefore two clicks from the home page, not only in the
    sitemap. Title pages: `<title>` "Watch {Title} ({Year}) | {Type} | {Site}" ≤ 60 characters (dropping
    the type, then the year, then "Watch"), the synopsis clipped to ~155 characters as the description
    (else `seo.default_description`), exactly one `<h1>` (the home feed behind the modal demotes its
    billboard heading), and Movie / TVSeries JSON-LD with `dateCreated`, cast, director, genres —
    never `aggregateRating`, because thumbs are not star reviews. Metadata is never streamed
    (`htmlLimitedBots: /.*/`), so every client finds it in `<head>`. Public genre pages merge both
    translation modes (the sitemap lists a genre when it has any published title), and the sitemap /
    catalogue fetches aren't cached in Next: the API already caches them under the catalog version, so
    a title published a moment ago is listed at once.
54. **Search-engine verification and IndexNow are DB config.** `seo.google_site_verification` and
    `seo.bing_site_verification` (public) render through `metadata.verification`; `seo.alternate_name`
    feeds the `WebSite` JSON-LD. `seo.indexnow_key` (not public) turns on IndexNow: the key file is
    `/<key>.txt` (a rewrite to an API view that 404s for any other key), and a Title status signal queues
    titles that become or stop being public; one Celery request goes out at most once a minute and is
    audit-logged (`seo.indexnow`). Google ignores IndexNow and reads the sitemap's `lastmod`
    (`updated_at`). The owner's checklist is `docs/SEO.md`.

## Plans & viewing-time limits

34. **Plans differ only in viewing time.** A `billing.Plan` has a price, a period and daily / weekly /
    monthly minute limits; quality, devices and features are identical on every plan (the plan card
    shows "Video quality: Best (same on every plan)"). Exactly one active, free plan is the default
    (DB constraints + an atomic hand-over in Studio). Limits are read live from the member's plan — never
    copied onto the user — so a Studio edit applies to everyone on that plan at once. Staff are exempt.
35. **Usage is metered by the server, per playback session.** Issuing a (non-preview) playback session
    checks the allowance (`403 usage_limit_reached` + the usage snapshot when spent) and opens a lease in
    Redis. The player reports content time every `usage.heartbeat_seconds`; the server credits
    `min(reported, time since the lease's previous beat + usage.tolerance_seconds)`, only while playing,
    so pauses, 2× speed or a tampered client can't inflate or dodge it, and concurrent streams each count.
    A resume sends a zero beat (restarts the server's clock), a pause credits what just played. The
    brand pre-roll, previews and (by default, `usage.count_trailers`) trailers are never counted.
36. **The player also stops loading.** Stream tokens of metered sessions carry the session; once the
    allowance is spent the API refuses new master / rendition playlists for them, so a client that ignores
    the heartbeat's `allowed: false` can't switch renditions or restart. Preview tokens carry their 720p cap
    (the `max_height` URL parameter can't lift it). Segments already listed stay fetchable until their
    signed URLs expire — the overshoot is bounded by one heartbeat for a well-behaved client.
37. **Windows are computed, not cron-reset.** Day / week / month keys come from the clock in
    `usage.timezone` (week start `usage.week_starts_on`; month = calendar month or the billing period).
    `UsageLedger` (one row per session per local day) is the source of truth; Redis counters are a cache
    rebuilt from it when missing. Staff corrections are `UsageAdjustment` rows (bonus minutes; a reset is a
    bonus equal to what was used), all audit-logged. A beat task only purges stale counter keys.
38. **Usage is shown only where it's asked for:** Account → Usage (three live bars, per-second reset
    countdowns re-synced every 30 s and from every heartbeat), one line in the profile menu, a toast at
    `usage.warn_at_minutes` while watching (never over the intro), and the limit overlay. Nothing on Home.

## Verification & password reset

39. **Email and phone are verified only when they're needed** — a paid plan or a free trial (skipping
    whatever is already verified). Free members are never asked. A verified address / number belongs to
    one account; verifying one that another account only *claimed* releases it from that account.
40. **We generate SMS codes ourselves by default (`sms.otp_provider = own`).** Only an HMAC of the code is
    stored, with its own expiry and attempt limit; a new code replaces the old one; sends are limited per
    account (cooldown), per number / address (hourly) and per IP (`security.rate_otp_send`). Owning the
    text lets the SMS end with the WebOTP line (`@domain #code`), so Android Chrome fills the boxes and
    iOS offers the code above the keyboard (`autocomplete="one-time-code"`). `beem_otp` (Beem generates
    and checks the PIN) is available, but loses automatic detection. Codes and message bodies are never
    logged.
41. **The code boxes are the one auto-submit in the app.** A complete code has nothing left to edit, so it
    submits itself (paste, the iOS suggestion or WebOTP included). Everything else still submits only on
    a button or Enter (decision 8).
42. **Forgot password never reveals who has an account.** The first step always answers the same and
    returns an opaque token (mapped server-side to an account or to nothing); the code goes to the
    account's verified phone, else its verified email. A correct code + new password bumps
    `token_version`, revokes every refresh token and signs this browser in.
43. **Test mode (`testing.mock_providers`)** replaces SMS, email (and, later, mobile money) with an
    outbox that only superadmins can read in Studio for an hour. It exists for staging and the e2e suite;
    Studio shows a warning while it's on.

## Payments, trials and renewals (Snippe mobile money)

44. **One funnel for every payment status.** Webhook, reconcile poll and Studio's test simulator all call
    `payments.settle()`, which locks the payment row, never moves a completed payment, and applies the
    subscription change exactly once (`applied_at`). Duplicate or late webhooks are harmless; every
    delivery is stored in `PaymentEvent` (rejected ones too) and de-duplicated by event id.
45. **Webhooks are verified, answered fast and processed by Celery.** HMAC-SHA256 of
    `"{X-Webhook-Timestamp}.{raw body}"` with the `whsec_` secret, constant-time compared, rejected when
    older than five minutes; the view stores the event, answers `OK` and enqueues the work. A reconcile
    task polls pending payments every two minutes (a lost webhook) and expires stale requests.
46. **Amounts only come from the server-side plan** (× `payments.amount_multiplier`, Snippe's
    "smallest unit"), never from the client. Each attempt has its own `Idempotency-Key` (≤ 30 chars);
    5xx / PAY_001 are retried with backoff under the same key, so a retry never double-charges. A second
    tap on Pay returns the request that is already pending.
47. **Subscription state machine.** Free trial: the plan's limits at once, no charge, `trialing` until
    `trial_end`. Renewal: at `period_end − renewal_lead_hours` (trials: at `trial_end`) an SMS reminder
    and a push; attempts at `retry_schedule_hours`; a completed renewal extends from the *previous*
    period end (no drift); unpaid at the end → `grace` (limits kept) for `grace_days` → the free plan
    (`expired`) with an SMS and a one-time in-app notice. Cancel = auto-renew off (kept to the end).
    Upgrade = charge now, new period from payment; downgrade = scheduled for the period end. Every change
    is audit-logged; the job locks each subscription so overlapping beats never double-charge.
48. **Test mode settles payments with signed webhooks.** With `testing.mock_providers` on, Snippe isn't
    called (`mock_…` references); the e2e suite signs webhooks with a known secret and posts them to the
    real public endpoint, and Studio can settle simulated payments and run the renewal job "as of" a
    later time. None of this is reachable with test mode off.

## Brand intro & open browsing

49. **The NETFLY ident is a separate pre-roll, never part of the HLS transcodes.** Concatenating it would
    mean re-transcoding the whole catalog, shifting resume positions, intro/credits markers, thumbnails
    and analytics, and freezing the ident. The player shows the clip (with sound — Play is a user gesture)
    while the title buffers paused underneath, then crossfades in. It never counts as progress, usage or
    startup time; a clip that hasn't loaded in 1.5 s is skipped. Previews and hero trailers never get it;
    autoplayed next episodes follow `intro.on_autoplay_next_episode` (off, like a binge). On app open a
    muted splash (an inline, nonce'd boot script decides before first paint) doubles as the loading
    screen, once per session / day / visit (`intro.app_open_frequency`), never for bots.
50. **Signed-out visitors browse the real app; an action opens the gate.** One design for everyone (crawlers
    get the same pages server-rendered). Play / My List / Rate / Remind store a validated intent in
    sessionStorage and the `next` URL; after sign-in, signup + plan, or verification + payment the app
    resumes it (Play → the player with the intro; the others run, toast and restore scroll). A URL-only
    intent needs a click, so a crafted link can't act for a signed-in viewer.

## Loading UI

51. **One brand loader, pure SVG + CSS; skeletons where there is a layout to hold.** `LogoMark` /
    `LogoLoader` (`@netfly/ui`) are the only loading UI in both apps (no spinners). The mark is traced
    from the reference artwork (`scripts/brand/trace_logo.py` → `logo-geometry.json`, 99.93 % IoU via
    `verify-logo.mjs`); the app icons and wordmark files are generated from the same geometry
    (`brand-icons.mjs`). All motion is CSS keyframes (`logo-loader.css`), so it animates in server
    HTML before hydration. Client components render `LazyLogoLoader` (the geometry is a separate
    chunk: server HTML keeps animating while it loads, and interaction-only loaders fetch it within
    their delay); only server components render `LogoLoader` directly. First-load JS therefore grows by
    0.1 kB on `/` and 0.5–0.9 kB on app pages (the delay/min-duration timeline). The rules:
    * **Skeleton vs loader.** Rows, grids, the hero and the title view keep their skeletons (they reserve
      the layout: CLS stays 0), with one `md` loader over the *first* skeleton block of a page, never one
      per card. Content areas with no layout to predict (search pending, notifications, episodes) get an
      `md` loader; route transitions (`loading.tsx` for category and watch pages) an `lg` loader in the
      content area below the header. Public SEO pages (`/title`, `/genre`) have none: a loading
      boundary streams the response, so the status is 200 before `notFound()` runs and no-JS crawlers
      never see the content swapped in (the title modal opens client-side anyway). There is no group-level
      `(browse)/loading.tsx`: the home feed is server-rendered with its own skeletons, and a group
      fallback streamed a loader before it that cost `/browse` 2–3 Lighthouse points. The `@modal` slot
      has an empty `loading.tsx`, otherwise every navigation waited on it and no route fallback showed;
      the player `lg` before the first frame and `md` when rebuffering (after 250 ms); preview / hero
      trailer warm-up an `sm` loader in the mute-button corner; saving buttons and fields `sm`.
    * **Boot.** App open never blocks on auth (server-rendered pages, decision 50; the intro splash is the
      app-open screen, decision 49), so a full-screen `lg` loader appears only where something does
      block: the profile gate while profiles load, and the player.
    * **No flashes.** A loader appears after `delay` (200 ms default, a CSS `animation-delay`), so fast
      loads show nothing; once shown it stays at least `minDuration` (400 ms) and fades out over 150 ms.
      The minimum only needs JS where the state toggles on the client (`LoaderPresence` /
      `LoaderTimeline`); server fallbacks use `LogoLoader` alone.
    * **Accessibility.** `role="status"` + `aria-live="polite"` with a hidden label ("Loading…" by
      default); `decorative` (aria-hidden) inside a container that already has `aria-busy`. Reduced
      motion: no travelling light, draw-on or scaling; only a 2 s opacity pulse (0.6 ↔ 1).

## Phone navigation

52. **The phone tab bar is always one tap away; everything else stacks around it.** Below `lg` (Studio:
    below `md`) the bottom tab bar is `fixed` and its height is `--tabbar-h`
    (`calc(64px + env(safe-area-inset-bottom))`, set on `:root` by a `<style>` the bar renders — so only
    while a bar exists, server-side, and without a `:root:has()` rule that Chrome re-checks on every DOM
    change — `0` on desktop and while the on-screen keyboard is up). The rules:
    * **Stacking.** The title modal (z 80/81) stops at `bottom: var(--tabbar-h)` and renders its own copy of
      the tab bar inside the dialog, so it is focusable and tappable there (a modal dialog makes the rest
      of the page inert); tapping a tab navigates and the `@modal` catch-all clears the modal; Escape and
      history back still close it. Pages end with `pb-tabbar`; toasts, the upload dock and dropdowns
      (Radix `collisionPadding`) keep `--tabbar-h` clear. No ancestor of a tab bar may get `transform`,
      `filter`, `perspective`, `contain: paint` or `will-change: transform` (that re-parents `fixed`);
      `mobile.spec.ts` checks the bar is at the viewport bottom after scrolling to the end of each page.
    * **Keyboard.** While a field has focus on a touch screen and the viewport is ≥ 150 px shorter than
      usual (visual viewport, or with `interactive-widget=resizes-content` the layout viewport against its
      tallest height for this screen orientation) the bar slides away in 150 ms.
    * **Back.** Nested phone pages (category, account, search with a query, legal) lead with a 44 px back
      chevron: history back when it stays in the app (client navigations are counted in the root
      providers, or a same-origin referrer), else the parent route. The player's back works the same way.
    * **Sizes.** Touch targets ≥ 44 × 44 px (Studio enforces it with one `pointer: coarse` rule instead of
      per-component sizes), no text under 12 px, and a grid without a column template gets
      `minmax(0, 1fr)` (an `auto` track grew to its widest content and pushed pages sideways).
      Studio tables scroll inside their card (`relative` scroller, so absolutely positioned `sr-only`
      labels can't escape it). The Next dev-tools badge is off: it sat on top of the tab bar.

## Resilience

32. **Errors are contained where they happen:** each home row and the hero have their own error boundary
    (a broken row never blanks the feed), route segments have `error.tsx` with a "Try again" that
    refreshes server data, `global-error.tsx` covers a failing root layout, and API errors are always
    `{code, message}` with status-based human fallbacks for responses that never reached Django
    (proxy 502s, timeouts). An offline banner appears while disconnected and refetches on reconnect.
33. **Rate limits on every new endpoint**: `security.rate_profiles`, `security.rate_engagement` (My List,
    ratings, reminders, Continue Watching, notifications) per user, and `security.rate_public`
    (landing, sitemap, Coming Soon) per IP.

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
