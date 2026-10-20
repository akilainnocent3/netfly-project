# Deploying NETFLY

## 1. Topology

```
            ┌──────── CloudFront (optional) ───────┐
browser ──► │ edge (nginx / ALB)                    │──► S3 (HLS segments, images)  ◄── direct PUT (uploads)
            │   /           → client (Next.js)      │
            │   studio.*    → admin  (Next.js)      │
            │   /api/*      → backend (gunicorn)    │──► Postgres 16, Redis 7
            └───────────────────────────────────────┘
                      workers: default queue · transcode queue (FFmpeg) · one beat
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
* **default** queue (`worker`): image renders, event flushing, popularity refresh — light; 2–4 concurrency.
* **beat**: exactly **one** instance.
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

## 8. Health & observability

* `GET /api/health` (DB check) for load-balancer health.
* Every API response carries `Server-Timing: app;dur=…`.
* Playback quality (startup time, rebuffer ratio, rendition mix) is on the Studio dashboard, fed by
  batched client events.
