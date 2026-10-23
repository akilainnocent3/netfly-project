"""Amazon S3 access built entirely from DB configuration.

Clients are cached per config fingerprint, so replacing credentials in the
admin app takes effect on the next call in every process.

Signed GET URLs are *time-bucketed*: the signing timestamp is rounded down so
the same object yields the same URL for a while. Browsers and the CDN can then
cache images and video segments even though every URL is signed.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import threading
from dataclasses import dataclass, replace
from typing import Any
from urllib.parse import quote, urlsplit

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from .config import config


class StorageNotConfigured(RuntimeError):
    pass


@dataclass(frozen=True)
class S3Settings:
    bucket: str
    region: str
    access_key: str
    secret_key: str
    endpoint: str
    prefix: str

    @property
    def fingerprint(self) -> str:
        raw = "|".join([self.bucket, self.region, self.access_key, self.secret_key, self.endpoint])
        return hashlib.sha256(raw.encode()).hexdigest()


def s3_settings(overrides: dict[str, str] | None = None) -> S3Settings:
    o = overrides or {}
    prefix = o.get("prefix", config.get_str("storage.s3.prefix"))
    if prefix and not prefix.endswith("/"):
        prefix += "/"
    s = S3Settings(
        bucket=o.get("bucket") or config.get_str("storage.s3.bucket"),
        region=o.get("region") or config.get_str("storage.s3.region") or "us-east-1",
        access_key=o.get("access_key_id") or config.get_secret("storage.s3.access_key_id"),
        secret_key=o.get("secret_access_key") or config.get_secret("storage.s3.secret_access_key"),
        endpoint=o.get("endpoint_url", config.get_str("storage.s3.endpoint_url")),
        prefix=prefix,
    )
    region = _bucket_region(s)
    return replace(s, region=region) if region and region != s.region else s


_regions: dict[tuple[str, str], str | None] = {}


def _bucket_region(s: S3Settings) -> str | None:
    """The bucket's real AWS region. A mismatch with the configured region is
    invisible server-side (boto follows S3's redirects) but breaks every
    presigned URL handed to browsers: S3 rejects it without CORS headers, so
    uploads fail as "Network error" and images don't load."""
    if s.endpoint or not s.bucket:
        return None
    cache_key = (s.bucket, s.access_key)
    if cache_key not in _regions:
        region = None
        try:
            probe = _make_client(replace(s, region="us-east-1"))
            meta = probe.head_bucket(Bucket=s.bucket)["ResponseMetadata"]
            region = meta.get("HTTPHeaders", {}).get("x-amz-bucket-region")
        except ClientError as exc:
            # S3 reports the region even when HeadBucket itself is denied.
            region = (
                exc.response.get("ResponseMetadata", {})
                .get("HTTPHeaders", {})
                .get("x-amz-bucket-region")
            )
        except BotoCoreError:
            return None  # transient: don't cache, try again next call
        _regions[cache_key] = region
    return _regions[cache_key]


_clients: dict[str, Any] = {}
_lock = threading.Lock()


def _make_client(s: S3Settings):
    kwargs: dict[str, Any] = {
        "region_name": s.region,
        "config": BotoConfig(
            signature_version="s3v4",
            retries={"max_attempts": 5, "mode": "adaptive"},
            s3={"addressing_style": "path" if s.endpoint else "virtual"},
            max_pool_connections=32,
        ),
    }
    if s.access_key and s.secret_key:
        kwargs["aws_access_key_id"] = s.access_key
        kwargs["aws_secret_access_key"] = s.secret_key
    if s.endpoint:
        kwargs["endpoint_url"] = s.endpoint
    return boto3.client("s3", **kwargs)


def client(s: S3Settings | None = None):
    s = s or s3_settings()
    if not s.bucket:
        raise StorageNotConfigured("Set storage.s3.bucket in Settings → Storage & CDN.")
    with _lock:
        c = _clients.get(s.fingerprint)
        if c is None:
            _clients.clear()
            c = _clients[s.fingerprint] = _make_client(s)
        return c


def full_key(key: str, s: S3Settings | None = None) -> str:
    s = s or s3_settings()
    return key if key.startswith(s.prefix) else f"{s.prefix}{key}"


# -- signed URLs ----------------------------------------------------------------
def _bucket_window(ttl: int) -> tuple[dt.datetime, int]:
    """Round the signing time down so URLs are stable within ttl/4."""
    now = dt.datetime.now(dt.UTC)
    step = max(60, ttl // 4)
    epoch = int(now.timestamp())
    signed_at = dt.datetime.fromtimestamp(epoch - epoch % step, dt.UTC)
    return signed_at, ttl


def _public_base(s: S3Settings) -> str:
    if s.endpoint:
        return f"{s.endpoint.rstrip('/')}/{s.bucket}"
    if s.region == "us-east-1":
        return f"https://{s.bucket}.s3.amazonaws.com"
    return f"https://{s.bucket}.s3.{s.region}.amazonaws.com"


def presign_get(key: str, ttl: int | None = None, *, s: S3Settings | None = None) -> str:
    s = s or s3_settings()
    if not s.bucket:
        return ""
    ttl = ttl or config.get_int("storage.signed_url_ttl_seconds", 21600)
    ttl = min(ttl, 604800)
    k = full_key(key, s)
    if config.get_bool("storage.cdn.enabled") and config.get_str("storage.cdn.domain"):
        return cdn_signed_url(k, ttl)
    if not (s.access_key and s.secret_key):
        # Instance-role credentials: fall back to boto's presigner (not time-bucketed).
        return client(s).generate_presigned_url(
            "get_object", Params={"Bucket": s.bucket, "Key": k}, ExpiresIn=ttl
        )
    signed_at, expires = _bucket_window(ttl)
    return sigv4_presign(s, k, signed_at, expires)


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def sigv4_presign(s: S3Settings, key: str, signed_at: dt.datetime, expires: int) -> str:
    """AWS Signature V4 query-string presign for GET with an explicit signing time."""
    base = _public_base(s)
    parsed = urlsplit(base)
    host = parsed.netloc
    path = f"{parsed.path.rstrip('/')}/{quote(key, safe='/~')}"
    amz_date = signed_at.strftime("%Y%m%dT%H%M%SZ")
    datestamp = signed_at.strftime("%Y%m%d")
    scope = f"{datestamp}/{s.region}/s3/aws4_request"
    params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": f"{s.access_key}/{scope}",
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(expires),
        "X-Amz-SignedHeaders": "host",
    }
    query = "&".join(
        f"{quote(k, safe='-_.~')}={quote(v, safe='-_.~')}" for k, v in sorted(params.items())
    )
    canonical = "\n".join(["GET", path, query, f"host:{host}", "", "host", "UNSIGNED-PAYLOAD"])
    to_sign = "\n".join(
        ["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()]
    )
    k_signing = _hmac(
        _hmac(_hmac(_hmac(f"AWS4{s.secret_key}".encode(), datestamp), s.region), "s3"),
        "aws4_request",
    )
    signature = hmac.new(k_signing, to_sign.encode(), hashlib.sha256).hexdigest()
    return f"{parsed.scheme}://{host}{path}?{query}&X-Amz-Signature={signature}"


def cdn_signed_url(key: str, ttl: int) -> str:
    from botocore.signers import CloudFrontSigner
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    domain = config.get_str("storage.cdn.domain").rstrip("/")
    if not domain.startswith("http"):
        domain = f"https://{domain}"
    url = f"{domain}/{quote(key, safe='/~')}"
    key_id = config.get_str("storage.cdn.key_pair_id")
    pem = config.get_secret("storage.cdn.private_key")
    if not (key_id and pem):
        return url  # CDN without signing (public distribution)
    private_key = serialization.load_pem_private_key(pem.encode(), password=None)

    def rsa_signer(message: bytes) -> bytes:
        return private_key.sign(
            message, padding.PKCS1v15(), hashes.SHA1()  # noqa: S303 - CloudFront requires SHA1
        )

    signed_at, expires = _bucket_window(ttl)
    expire_at = signed_at + dt.timedelta(seconds=expires)
    return CloudFrontSigner(key_id, rsa_signer).generate_presigned_url(
        url, date_less_than=expire_at
    )


# -- object helpers -------------------------------------------------------------
LONG_CACHE = "public, max-age=31536000, immutable"
SHORT_CACHE = "public, max-age=30"


def put_bytes(key: str, data: bytes, content_type: str, cache_control: str = LONG_CACHE) -> str:
    s = s3_settings()
    k = full_key(key, s)
    client(s).put_object(
        Bucket=s.bucket, Key=k, Body=data, ContentType=content_type, CacheControl=cache_control
    )
    return k


def upload_file(path: str, key: str, content_type: str, cache_control: str = LONG_CACHE) -> str:
    s = s3_settings()
    k = full_key(key, s)
    client(s).upload_file(
        path, s.bucket, k, ExtraArgs={"ContentType": content_type, "CacheControl": cache_control}
    )
    return k


def get_bytes(key: str) -> bytes:
    s = s3_settings()
    return client(s).get_object(Bucket=s.bucket, Key=full_key(key, s))["Body"].read()


def download_file(key: str, path: str) -> None:
    s = s3_settings()
    client(s).download_file(s.bucket, full_key(key, s), path)


def delete_prefix(prefix: str) -> int:
    s = s3_settings()
    c = client(s)
    deleted = 0
    for page in c.get_paginator("list_objects_v2").paginate(
        Bucket=s.bucket, Prefix=full_key(prefix, s)
    ):
        objects = [{"Key": o["Key"]} for o in page.get("Contents", [])]
        if objects:
            c.delete_objects(Bucket=s.bucket, Delete={"Objects": objects})
            deleted += len(objects)
    return deleted


def usage_bytes() -> int:
    s = s3_settings()
    total = 0
    for page in (
        client(s).get_paginator("list_objects_v2").paginate(Bucket=s.bucket, Prefix=s.prefix)
    ):
        total += sum(o["Size"] for o in page.get("Contents", []))
    return total


def is_configured() -> bool:
    return bool(config.get_str("storage.s3.bucket"))


CORS_RULES = [
    {
        "AllowedOrigins": ["*"],
        "AllowedMethods": ["GET", "HEAD", "PUT"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
        "MaxAgeSeconds": 3600,
    }
]


def apply_bucket_cors(origins: list[str] | None = None) -> None:
    """Browsers upload parts (PUT) and fetch segments (GET) straight from S3."""
    s = s3_settings()
    rules = [dict(CORS_RULES[0], AllowedOrigins=origins or ["*"])]
    client(s).put_bucket_cors(Bucket=s.bucket, CORSConfiguration={"CORSRules": rules})


def test_connection(overrides: dict[str, str] | None = None) -> dict[str, Any]:
    """Verify credentials can list, write, read and delete in the bucket."""
    s = s3_settings(overrides)
    if not s.bucket:
        return {"ok": False, "message": "Bucket is not set."}
    c = _make_client(s)
    probe = f"{s.prefix}.netfly-connection-test"
    steps: list[str] = []
    try:
        try:
            c.head_bucket(Bucket=s.bucket)
            steps.append("bucket reachable")
        except ClientError as exc:
            # Prefix-scoped policies often deny HeadBucket but allow object access: keep going.
            if exc.response.get("Error", {}).get("Code") not in (
                "403",
                "AccessDenied",
                "Forbidden",
            ):
                raise
            steps.append("bucket-level access denied (object access checked next)")
        c.put_object(Bucket=s.bucket, Key=probe, Body=b"ok")
        steps.append("write ok")
        c.get_object(Bucket=s.bucket, Key=probe)["Body"].read()
        steps.append("read ok")
        c.delete_object(Bucket=s.bucket, Key=probe)
        steps.append("delete ok")
        try:
            cors = c.get_bucket_cors(Bucket=s.bucket).get("CORSRules", [])
            steps.append("CORS configured" if cors else "CORS missing")
        except ClientError:
            steps.append("CORS missing — use 'Apply CORS' so browsers can upload and play")
        return {"ok": True, "message": "Connected to S3.", "steps": steps}
    except ClientError as exc:
        err = exc.response.get("Error", {})
        return {
            "ok": False,
            "message": f"{err.get('Code', 'Error')}: {err.get('Message', 'request failed')}",
            "steps": steps,
        }
    except BotoCoreError as exc:
        return {"ok": False, "message": str(exc), "steps": steps}
