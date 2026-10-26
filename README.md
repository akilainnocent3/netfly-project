# NETFLY

A production-grade movie & series streaming platform: Django/DRF API, Celery + FFmpeg HLS pipeline,
Amazon S3 storage, and two Next.js 15 apps — **client** (viewers) and **admin** ("Studio", staff).

## Quick start (local)

```bash
docker compose up            # postgres, redis, backend, workers (default, transcode, extraction), beat, client, admin
```

| URL                              | What                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| http://localhost:3000            | Viewer app: public landing page; sign up / sign in to browse                                               |
| http://localhost:3001            | Studio (admin). Local superadmin: `admin` / `netfly-dev-admin` (override with `NETFLY_DEV_ADMIN_PASSWORD`) |
| http://localhost:8000/api/schema | OpenAPI schema                                                                                             |

The demo catalog (6 movies, 2 series, both translation states) is created on first boot.
**Media needs S3:** open _Studio → Settings → Storage & CDN_, enter your bucket, region and IAM keys,
press **Test connection**, **Save**, then **Apply CORS to bucket**. Re-seed with generated artwork and
videos (pushed through the real image + transcode pipeline):

```bash
docker compose exec backend python manage.py seed_demo --reset
```

## What's inside

- **Viewer app** — Netflix-style browsing: personalised home feed (Top picks, Because you liked, genre rows,
  Continue Watching), billboard with muted trailer, hover cards, title modal with episodes and More Like
  This, New & Popular with Remind me, Series / Films pages, instant search, custom HLS player (Skip Intro,
  Next Episode, keyboard shortcuts), optional profiles (`features.profiles_enabled`), mobile tab bar.
- **Public, crawlable pages** for signed-out visitors: landing page, `/title/<slug>` and `/genre/<slug>`
  with JSON-LD, Open Graph, `robots.txt` and `sitemap.xml` (see _docs/DECISIONS.md → Search engines_).
- **Membership** — plans that differ only in viewing time (hours per day / week / month; every plan
  streams at the same top quality), a free default plan, free trials, server-side usage metering with
  live countdowns in Account, email + phone verification (SMS codes with automatic fill) for paid plans
  and trials, and Snippe mobile-money payments (M-Pesa, Airtel Money, Mixx by Yas, Halotel) with
  renewals, retries, grace and automatic downgrade. The NETFLY ident plays on app open and before
  every playback.
- **Studio** — plans, subscribers, billing tiles, catalog editor, uploads and transcoding monitor, home layout, settings, users, audit log, and a
  per-title **recommendation priority** (boost −2…+5 with an optional campaign window) that reaches every
  viewer immediately. A title's trailer can be uploaded or **generated from its own video**: pick a range
  (e.g. 7:00 → 9:00) on the preview and NETFLY cuts and transcodes it (decision 56). **Video
  extraction** crawls a website, lists every link it finds, checks whether a page or video can be
  embedded or played in NETFLY (with a live preview), and saves approved embeds — with a title and
  description written by staff and a rights confirmation — for the viewer app, which doesn't show
  them yet (decisions 67–72).

## Configuration

Only four environment variables exist — `DATABASE_URL`, `REDIS_URL`, `DJANGO_SECRET_KEY`,
`CONFIG_ENCRYPTION_KEY` (a Fernet key: `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`).
The frontends need `NETFLY_API_URL` (where the API is, server-side). **Everything else** — S3/CDN credentials,
branding, feature flags, JWT lifetimes, rate limits, the bitrate ladder, recommendation weights — lives in the
database, is edited in _Studio → Settings_, and applies within ~1 s without a restart. Secrets are
Fernet-encrypted and write-only.

Going live with membership (all in _Studio → Settings_):

- **Email** — SMTP host/port/user/password, sender, the code email template → _Send test email_.
- **SMS (Beem Africa)** — API key + secret key, a sender ID that is **registered and active in the Beem
  dashboard** (≤ 11 chars; an unapproved one is refused with code 111 and no text arrives), the default
  country for numbers typed without a code (`sms.default_region`, TZ), OTP settings; keep
  `sms.otp_provider = own` so phones can fill codes in automatically (the SMS ends with `@domain #code`;
  set `sms.webotp_domain` to the viewer site's domain) → _Send test SMS_ (shows Beem's raw answer),
  _Check balance_. A failed code send is in _Studio → Audit log_ as `verification.phone_send_failed`
  with Beem's answer.
- **Payments (Snippe)** — API key (`snp_…`), webhook secret (`whsec_…`) and **Webhook public URL**
  (`https://<site>/api/v1/payments/webhook/snippe`, register the same URL with Snippe) → _Test API key_,
  then one small payment to confirm `payments.amount_multiplier`. Trial length, renewal lead time, retry
  schedule and grace days live here too; prices and limits are edited under _Studio → Plans_.
- **Test mode** — simulates SMS, email and payments for staging and the e2e suite. Keep it **off** in
  production.

## Layout

```
backend/            Django 5 + DRF (apps: core, accounts, catalog, media, engagement, recommendations,
                    billing, messaging, extraction, adminapi)
apps/client/        Next.js viewer app      apps/admin/   Next.js studio
packages/api-client Typed client generated from OpenAPI   packages/ui   shared tokens, hooks
infra/              node image, nginx edge  e2e/          Playwright suite
docs/               DECISIONS.md, DEPLOY.md
```

## Development

```bash
# backend
cd backend && pip install -r requirements-dev.txt
python -m pytest            # needs Postgres + Redis (docker compose up postgres redis)
ruff check . && black --check .

# API types (after backend API changes)
sh backend/scripts/export_openapi.sh && pnpm api:generate

# frontends
pnpm install && pnpm typecheck && pnpm lint && pnpm build

# end-to-end (stack running, demo catalog seeded)
pnpm e2e        # includes axe checks, SEO contract, signup → plan → verify → pay journeys, search
                # (global setup turns test mode on; global teardown turns it off again)
NETFLY_E2E_CHANNEL=chrome pnpm e2e   # also runs the video specs (Playwright's Chromium has no H.264)
pnpm seo:audit  # crawl from sitemap.xml as Googlebot (no JS): titles, canonicals, JSON-LD, A–Z
                # crawl depth, plus a small "the rain" search simulation (see docs/SEO.md)

# Brand mark: geometry is traced from the artwork; icons + wordmark files are generated from it
python scripts/brand/trace_logo.py && node scripts/brand/verify-logo.mjs   # only if the artwork changes
node scripts/brand/brand-icons.mjs                                        # favicons, PWA icons, wordmark

# Transcoding needs FFmpeg (ffmpeg + ffprobe) wherever a worker consumes the `transcode` queue.
# Easiest: docker compose up worker-transcode (the image ships it). For a host-run worker install it:
#   Debian/Ubuntu: sudo apt-get install -y ffmpeg      macOS: brew install ffmpeg
#   Windows:       winget install Gyan.FFmpeg          (then open a new terminal so PATH updates)
# Not on PATH? Set Settings → Transcoding → ffmpeg path / ffprobe path. Studio → Transcoding shows
# whether a worker is running and can find FFmpeg.

# Optional local S3 for media (moto): pip install "moto[server]" && moto_server -p 5005,
# then set storage.s3.endpoint_url=http://localhost:5005 (+ bucket/keys) and run seed_demo --reset
```

See `docs/DEPLOY.md` for production, `docs/SEO.md` for getting indexed by search engines and
`docs/DECISIONS.md` for design decisions.

## Screenshots

Captured by Playwright against the seeded demo catalog (`docs/screenshots/`):
landing page and public title page (what search engines see), `/browse`, hover card, title modal
with episodes and More Like This, New & Popular, search, mobile home, the Studio priority control and
titles list, and the profile gate.
