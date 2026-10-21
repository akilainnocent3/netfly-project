# NETFLY

A production-grade movie & series streaming platform: Django/DRF API, Celery + FFmpeg HLS pipeline,
Amazon S3 storage, and two Next.js 15 apps — **client** (viewers) and **admin** ("Studio", staff).

## Quick start (local)

```bash
docker compose up            # postgres, redis, backend, workers, beat, client, admin
```

| URL | What |
|---|---|
| http://localhost:3000 | Viewer app: public landing page; sign up / sign in to browse |
| http://localhost:3001 | Studio (admin). Local superadmin: `admin` / `netfly-dev-admin` (override with `NETFLY_DEV_ADMIN_PASSWORD`) |
| http://localhost:8000/api/schema | OpenAPI schema |

The demo catalog (6 movies, 2 series, both translation states) is created on first boot.
**Media needs S3:** open *Studio → Settings → Storage & CDN*, enter your bucket, region and IAM keys,
press **Test connection**, **Save**, then **Apply CORS to bucket**. Re-seed with generated artwork and
videos (pushed through the real image + transcode pipeline):

```bash
docker compose exec backend python manage.py seed_demo --reset
```

## What's inside

* **Viewer app** — Netflix-style browsing: personalised home feed (Top picks, Because you liked, genre rows,
  Continue Watching), billboard with muted trailer, hover cards, title modal with episodes and More Like
  This, New & Popular with Remind me, Series / Films pages, instant search, custom HLS player (Skip Intro,
  Next Episode, keyboard shortcuts), optional profiles (`features.profiles_enabled`), mobile tab bar.
* **Public, crawlable pages** for signed-out visitors: landing page, `/title/<slug>` and `/genre/<slug>`
  with JSON-LD, Open Graph, `robots.txt` and `sitemap.xml` (see *docs/DECISIONS.md → Search engines*).
* **Studio** — catalog editor, uploads and transcoding monitor, home layout, settings, users, audit log, and a
  per-title **recommendation priority** (boost −2…+5 with an optional campaign window) that reaches every
  viewer immediately.

## Configuration

Only four environment variables exist — `DATABASE_URL`, `REDIS_URL`, `DJANGO_SECRET_KEY`,
`CONFIG_ENCRYPTION_KEY` (a Fernet key: `python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`).
The frontends need `NETFLY_API_URL` (where the API is, server-side). **Everything else** — S3/CDN credentials,
branding, feature flags, JWT lifetimes, rate limits, the bitrate ladder, recommendation weights — lives in the
database, is edited in *Studio → Settings*, and applies within ~1 s without a restart. Secrets are
Fernet-encrypted and write-only.

## Layout

```
backend/            Django 5 + DRF (apps: core, accounts, catalog, media, engagement, recommendations, adminapi)
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
pnpm e2e        # includes axe accessibility checks, SEO contract, Studio boost → viewer, profiles
NETFLY_E2E_CHANNEL=chrome pnpm e2e   # also runs the video specs (Playwright's Chromium has no H.264)

# Optional local S3 for media (moto): pip install "moto[server]" && moto_server -p 5005,
# then set storage.s3.endpoint_url=http://localhost:5005 (+ bucket/keys) and run seed_demo --reset
```

See `docs/DEPLOY.md` for production and `docs/DECISIONS.md` for design decisions.

## Screenshots

Captured by Playwright against the seeded demo catalog (`docs/screenshots/`):
landing page and public title page (what search engines see), `/browse`, hover card, title modal
with episodes and More Like This, New & Popular, search, mobile home, the Studio priority control and
titles list, and the profile gate.

