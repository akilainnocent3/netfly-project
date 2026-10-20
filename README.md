# NETFLY

A production-grade movie & series streaming platform: Django/DRF API, Celery + FFmpeg HLS pipeline,
Amazon S3 storage, and two Next.js 15 apps — **client** (viewers) and **admin** ("Studio", staff).

## Quick start (local)

```bash
docker compose up            # postgres, redis, backend, workers, beat, client, admin
```

| URL | What |
|---|---|
| http://localhost:3000 | Viewer app (sign up — the form submits itself) |
| http://localhost:3001 | Studio (admin). Local superadmin: `admin` / `netfly-dev-admin` (override with `NETFLY_DEV_ADMIN_PASSWORD`) |
| http://localhost:8000/api/schema | OpenAPI schema |

The demo catalog (6 movies, 2 series, both translation states) is created on first boot.
**Media needs S3:** open *Studio → Settings → Storage & CDN*, enter your bucket, region and IAM keys,
press **Test connection**, **Save**, then **Apply CORS to bucket**. Re-seed with generated artwork and
videos (pushed through the real image + transcode pipeline):

```bash
docker compose exec backend python manage.py seed_demo --reset
```

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

# end-to-end (stack running)
pnpm e2e
```

See `docs/DEPLOY.md` for production and `docs/DECISIONS.md` for design decisions.
