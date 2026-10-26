# Deploying NETFLY

## 1. Topology

```
            ┌──────── CloudFront (optional) ───────┐
browser ──► │ edge (nginx / ALB)                    │──► S3 (HLS segments, images)  ◄── direct PUT (uploads)
            │   /           → client (Next.js)      │
            │   studio.*    → admin  (Next.js)      │
            │   /api/*      → backend (gunicorn)    │──► Postgres 16, Redis 7
            └───────────────────────────────────────┘
                      workers: default queue · transcode queue (FFmpeg) · extraction queue · one beat
```

Web tiers are stateless; scale `backend`, `client`, `admin` horizontally behind the edge. Video bytes never
pass through Django or Next.js: uploads go browser → S3 (presigned multipart) and playback fetches
segments from S3/CloudFront with signed URLs.

`docker-compose.prod.yml` runs the whole stack on one host (`backend` gunicorn, two transcode workers,
one beat, both Next apps in standalone mode, nginx from `infra/nginx.conf`). For larger installs run the
same images on ECS/Kubernetes with managed Postgres (RDS) and Redis (ElastiCache).

## 2. Bootstrap variables

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/netfly?sslmode=require` |
| `REDIS_URL` | `rediss://…` in production. Used for cache, config snapshot, Celery broker, event buffer |
| `DJANGO_SECRET_KEY` | 50+ random chars. Rotating it signs everyone out |
| `CONFIG_ENCRYPTION_KEY` | Fernet key encrypting DB secrets. **Back it up** — losing it means re-entering S3/CDN secrets |
| `NETFLY_API_URL` | Frontends only: internal URL of the backend (e.g. `http://backend:8000`) |

First boot: `migrate` and `seed_config` run automatically (the `migrate` service). Create the first
superadmin with `python manage.py createsuperuser`, then sign in to the Studio.

## 3. Amazon S3

1. Create a bucket (Block Public Access **on** — nothing is public; every URL is signed).
2. Create an IAM user (or instance role) with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketCORS", "s3:PutBucketCORS", "s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET" },
    { "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET/*" 
}
```

3. *Studio → Settings → Storage & CDN*: bucket, region, keys, key prefix → **Test connection** → **Save**.
4. Add your production origins to `security.cors_allowed_origins`, then **Apply CORS to bucket** (browsers PUT
   upload parts and GET segments cross-origin; the `ETag` header must be exposed).
5. Recommended lifecycle rules: abort incomplete multipart uploads after 7 days; optionally transition
   `sources/` to S3 Glacier Instant Retrieval after transcoding.

## 4. CDN (CloudFront)

1. Create a distribution with the bucket as origin using **Origin Access Control** (bucket stays private).
2. Cache policy: honour origin `Cache-Control` (segments/images are `immutable`, playlists are served by the API).
3. Create a CloudFront public key + key group; set the distribution to **restrict viewer access** with it.
4. *Settings → Storage & CDN*: `storage.cdn.enabled = true`, `storage.cdn.domain`, `storage.cdn.key_pair_id`,
   and the private key (write-only secret). Press **Test CDN**.

Signed URLs are time-bucketed (stable for a quarter of their TTL), so the CDN and browsers keep cache hits
even though every URL is signed.

## 5. Scaling workers

* **transcode** queue (`worker-transcode`): CPU-bound FFmpeg. Run on compute-optimised instances,
  `-c 1` per worker process and scale *replicas* (one encode per vCPU-group). Each job needs ~3× the source
  size of local disk. `--max-tasks-per-child` keeps memory flat. Long jobs are `acks_late`, so a lost
  worker re-queues its job; failures retry with exponential backoff up to `transcoding.max_retries`.
* **FFmpeg on transcode workers.** Every process that consumes `transcode` needs `ffmpeg` and `ffprobe`.
  `backend/Dockerfile` installs them and the build fails without them. Anywhere else, install FFmpeg the
  platform's way: `sudo apt-get install -y ffmpeg` on a VPS with a systemd/host-run worker; an apt
  buildpack with an `Aptfile` containing `ffmpeg` on Heroku-style platforms; or point the worker service
  at `backend/Dockerfile` (Render, Railway, Fly, ECS). Binaries outside `PATH`: set
  `transcoding.ffmpeg_path` / `transcoding.ffprobe_path` in Settings → Transcoding. Workers log an
  error at startup when FFmpeg is missing, jobs fail immediately with an operator-facing message (no
  download, no retries), and Studio → Transcoding shows the worker status. After fixing, press *Retry*:
  the S3 source is reused, no re-upload.
* **default** queue (`worker`): image renders, event flushing, popularity refresh — light; 2–4 concurrency.
* **extraction** queue (`worker-extraction`): Studio → Video extraction crawls and link checks. They
  fetch arbitrary websites, so they run on their own workers (`-Q extraction -c 2`), never on the
  default queue. Network-bound and light (a crawl holds at most two requests per site); one or two
  replicas are plenty. A crawl is limited to 30 minutes and a link check to 2 minutes.
  * **Image.** `docker-compose.prod.yml` builds it from the `extraction` stage of `backend/Dockerfile`:
    the prod image plus Playwright and Chromium (≈ 400 MB more), used only for the optional *Render
    JavaScript* crawl option. The API and the other workers keep the slim image. Run it from the
    `prod` image instead and Studio simply shows *Render JavaScript* as unavailable, with the reason.
    Chromium needs `shm_size: 512mb` (set in the compose file).
  * **Network.** The crawler only connects to public addresses on ports 80/443, resolves DNS itself
    and pins the vetted IP, re-checks every redirect, and never sends cookies or credentials
    (decision 67). Defence in depth: give these workers a network where only Postgres, Redis and the
    internet are reachable — no route to other internal services or the cloud metadata endpoint
    (on AWS also set IMDSv2 hop limit 1).
  * **ffprobe** (already in the image) is used to read a direct file's codec, resolution and duration
    from a sparse local copy of its first and last few MB; without it checks still work and say
    “codec not checked”.
* **beat**: exactly **one** instance. Besides catalog jobs it runs `run_renewals` (every 5 min: renewal
  reminders and pushes, trial conversions, retries, grace, downgrades), `reconcile_payments` (every 2 min:
  polls Snippe for pending payments in case a webhook was lost) and `purge_usage_keys` (hourly). They are
  idempotent and lock per subscription, but two beats would still double the provider traffic.
* Ladder/preset changes in Settings apply to new jobs immediately. Use *Transcoding → Retry* to re-encode.

## 6. Backups & data

* **Postgres**: automated daily snapshots + PITR (RDS) or `pg_dump -Fc` nightly to S3 with 30-day retention.
  Test restores quarterly. The DB holds config (with encrypted secrets), catalog, users, progress.
* **CONFIG_ENCRYPTION_KEY / DJANGO_SECRET_KEY**: store in your secret manager; include in DR runbooks.
* **S3**: enable versioning on the bucket (or at least on `images/` and `sources/`) and cross-region
  replication if required. HLS renditions can always be regenerated from `sources/`.
* **Redis**: cache + broker only; losing it drops queued jobs (re-queue from *Transcoding*) and unflushed
  analytics (≤ 10 s). Use AOF persistence for the broker.
* **ViewEvent** is append-only and partition-ready by `created_at`; convert to monthly range partitions
  (`pg_partman`) once it grows past ~100M rows and drop/archive old partitions.

## 7. Security checklist

* TLS everywhere; set `security.ssl_redirect = true` and keep `security.hsts_seconds` at ≥ 1 year.
* Set `security.allowed_hosts` and `security.cors_allowed_origins` to your real domains.
* `auth.cookie_domain` empty (host-only) unless client and API share a parent domain by design.
* Review rate limits under *Settings → Security* and the edge `limit_req` in `infra/nginx.conf`.
* Studio should be reachable only on `studio.` (optionally behind VPN/IP allow-list).
* The audit log records every staff write; ship it to your SIEM if required.
* **Payments webhook:** `POST /api/v1/payments/webhook/snippe` must be reachable from the internet (the
  bundled `infra/nginx.conf` routes it without the per-IP rate limit). Set *Settings → Payments → Webhook
  public URL* to that address (renewals run in Celery and have no request to derive it from), register
  it with Snippe, and save the `whsec_…` secret. Requests without a valid, ≤ 5-minute-old signature are
  rejected and logged as rejected `PaymentEvent`s.
* **Test mode** (`testing.mock_providers`) must be **off** in production: with it on no SMS, email or
  payment is real. Studio shows a warning banner while it's on.
* **Video extraction** makes the server fetch URLs staff type in. Keep `extraction.allowed_ports` at
  `[80, 443]`, keep `extraction.test_hosts` empty (it only works in test mode anyway), and isolate
  `worker-extraction` as described in §5. Only content managers and superadmins can use it; every
  crawl, check, approval, edit and revoke is in the audit log.
* Secrets (SMTP password, Beem keys, Snippe key and webhook secret) are write-only in Studio and
  Fernet-encrypted with `CONFIG_ENCRYPTION_KEY`; codes and message bodies never reach the logs.

## 8. Health & observability

* `GET /api/health` (DB check) for load-balancer health.
* Every API response carries `Server-Timing: app;dur=…`.
* Playback quality (startup time, rebuffer ratio, rendition mix) is on the Studio dashboard, fed by
  batched client events.

## 9. Search engines

* Set `seo.site_url` (*Settings → Search & sharing*) to the public origin, e.g. `https://watch.example.com`.
  It is used for canonical links, Open Graph URLs, `robots.txt` and `sitemap.xml`. When empty the request
  host is used, which is fine behind a single edge but wrong behind a CDN that rewrites `Host`.
* Make sure the edge preserves `Host` and sets `X-Forwarded-Proto` for the client app (the bundled
  `infra/nginx.conf` does), and that `/robots.txt` and `/sitemap.xml` reach the **client** app.
* Submit `https://<site>/sitemap.xml` in Google Search Console / Bing Webmaster Tools.
* On staging set `seo.indexing_enabled = false`: every page becomes `noindex` and robots.txt disallows all.

## 10. Upgrading to this release

### Studio → Video extraction (this release)

Migration (additive): `extraction.0001_initial` — `ExtractionJob`, `DiscoveredLink`,
`ApprovedEmbed`. New service **`worker-extraction`** (`celery -A netfly worker -Q extraction`), built
from the new `extraction` stage of `backend/Dockerfile` in production (Chromium for *Render
JavaScript*); in `docker-compose.yml` it uses the dev image without Chromium. Without any extraction
worker, crawls stay *queued* and Studio says so. New Python dependencies: `httpx[http2]`, `h2`,
`selectolax`, `tldextract` (bundled public-suffix list, no network), `defusedxml`; the extraction
stage adds `playwright`. Beat runs `purge_old_jobs` daily.

New settings group **Video extraction** (seeded; edit in *Studio → Settings*):

| Key | Default | Purpose |
|---|---|---|
| `extraction.max_pages` | 200 | Most pages one crawl fetches (staff may choose fewer) |
| `extraction.max_depth` | 2 | Clicks away from the start page |
| `extraction.max_links` | 5000 | Most links one crawl records |
| `extraction.max_probes` | 100 | HEAD requests to classify links that weren't crawled |
| `extraction.timeout_seconds` | 15 | Per-request timeout (total per request: twice this) |
| `extraction.delay_ms` | 500 | Pause between requests to one site (robots.txt Crawl-delay wins, ≤ 10 s) |
| `extraction.user_agent` | `NetflyBot/1.0 (+{site_url})` | Crawler User-Agent; `{site_url}` = `seo.site_url` |
| `extraction.respect_robots` | true | Default of the per-crawl *Respect robots.txt* option |
| `extraction.max_response_mb` | 10 | Largest response read, after decompression |
| `extraction.allowed_ports` | `[80, 443]` | Ports the crawler may connect to |
| `extraction.max_concurrent_jobs` | 2 | Running crawls per staff member (more → 429 `too_many_jobs`) |
| `extraction.retention_days` | 30 | Crawls and links are deleted after this; approved embeds stay |
| `extraction.check_cache_seconds` | 3600 | A link check is reused for the same URL this long |
| `extraction.embed_hosts` | YouTube, Vimeo, Dailymotion, Wistia, JW Player, Facebook, Instagram, TikTok, Twitch, Streamable, SoundCloud player hosts | Hosts provider embed iframes may come from |
| `extraction.facebook_app_token` | — (secret) | Facebook/Instagram oEmbed; without it those videos say “needs provider token” |
| `extraction.test_hosts` | `[]` | `host:port` the crawler may reach although private — **only while test mode is on** (e2e) |
| `security.rate_extraction` | 240/min | Extraction reads and previews per staff user / IP |
| `security.rate_extraction_start` | 30/hour | Crawls started per staff user |
| `security.rate_extraction_write` | 60/min | Checks, approvals, edits, revokes, cancels per staff user |

Approved embeds are stored for the viewer app but **not shown to viewers yet** (decision 72).

### Plans, verification, payments and search (this release)

Migrations (additive): `billing.0001_initial` (plans, subscriptions, usage ledger and adjustments,
trial claims), `billing.0002_seed_plans_and_free_subscriptions` (data: the four default plans — Bure
free/default, Mwanzo, Pendwa, Kinara — and a free subscription for every existing account),
`billing.0003_payments` (payments, webhook events, subscription notices), `accounts.0003_…` (email,
phone, verified timestamps, remember-me), `accounts.0004_verification_codes`.

New settings groups (seeded; edit in *Studio → Settings*): **Brand intro** (`intro.*`), **Usage limits**
(`usage.*`), **Email** (`email.*`: SMTP + code email), **SMS (Beem Africa)** (`sms.*`), **Payments
(Snippe)** (`payments.*`), **Test mode** (`testing.mock_providers`), and rate limits
`security.rate_otp_send`, `security.rate_otp_check`, `security.rate_payment`. Go-live order: SMTP → *Send
test email*; Beem keys + approved sender ID → *Send test SMS* / *Check balance*; Snippe key + webhook secret
+ public webhook URL → *Test API key*, then one small real payment to confirm `payments.amount_multiplier`.

Run `python manage.py migrate` then `python manage.py seed_config` (both run automatically in the
`migrate` service). All migrations are additive and safe to run before the new code is live.

| Migration | What it does |
|---|---|
| `catalog.0003_title_boost` | `Title.boost` (−2…+5, default 0), `boost_starts_at`, `boost_ends_at`; index on `(status, boost)` |
| `catalog.0004_title_moods` | `Title.moods` ("This title is…" tags, max 3) |
| `core.0002_netflix_palette_defaults` | Data: moves branding colours/font to the new defaults **only** where they still hold the old defaults |
| `core.0003_remove_autosubmit_delay` | Data: deletes the obsolete `ux.autosubmit_delay_ms` key |
| `accounts.0002_…` | `notifications_seen_at` on users and profiles; per-profile `translation_mode` |
| `engagement.0002_…` | Continue Watching "Remove from row" flag on progress; `Reminder` (Remind me) |

New configuration keys (seeded with these defaults; edit in *Studio → Settings*):

| Key | Default | Purpose |
|---|---|---|
| `recommendations.weight_boost` | 0.6 | Score added per boost level |
| `recommendations.boost_pin_top_picks` | 2 | Highest-boost titles guaranteed in the first Top picks slots |
| `recommendations.cold_start_popularity` | 1.0 | Popularity weight for viewers without history |
| `recommendations.row_dedupe_window` | 3 | Max rows a title may appear in on one home page |
| `features.max_profiles` | 5 | Profiles per account (when `features.profiles_enabled`) |
| `content.kids_ratings` | G, PG, TV-Y, TV-PG | Maturity ratings visible to kids profiles |
| `content.badge_days` | 14 | Window for "Recently added" / "New episodes" / "Leaving soon" badges |
| `content.upcoming_days` | 60 | How far ahead Coming Soon looks |
| `content.client_app_url` | — | Viewer app URL used for links from the Studio |
| `security.rate_profiles` | 30/min | Profile create/edit/delete per user |
| `security.rate_engagement` | 120/min | My List, ratings, reminders, Continue Watching, notifications per user |
| `security.rate_public` | 240/min | Signed-out landing, sitemap and Coming Soon per IP |
| `seo.indexing_enabled` | true | Allow search engines to index public pages |
| `seo.site_url` | — | Canonical public origin |
| `seo.default_description` | — | Landing page description (falls back to the tagline) |

Removed: `ux.autosubmit_delay_ms` (no form submits itself any more).

Behaviour changes to note:

* Signed-out visitors to `/` now see a landing page instead of a redirect to `/signup`, and `/title/<slug>`
  and `/genre/<slug>` render public pages instead of redirecting to `/login`.
* Admin edits are visible to viewers immediately (catalog cache version); no 15-minute wait.
