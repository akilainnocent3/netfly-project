import datetime as dt

import pytest
from botocore.auth import S3SigV4QueryAuth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials

from apps.core.config import ConfigValidationError, config, decrypt
from apps.core.models import AuditLog, ConfigEntry

pytestmark = pytest.mark.django_db


def test_typed_getters_return_seeded_defaults():
    assert config.get_int("auth.access_token_minutes") == 15
    assert config.get_bool("features.signup_enabled") is True
    assert config.get_str("branding.site_name") == "NETFLY"
    assert isinstance(config.get_json("transcoding.ladder"), list)


def test_set_invalidates_cache_and_audits(staff):
    assert config.get_str("branding.accent_color") == "#FF2E4D"
    config.set("branding.accent_color", "#00AAFF", actor=staff)
    assert config.get_str("branding.accent_color") == "#00AAFF"
    log = AuditLog.objects.get(action="config.update")
    assert log.changes["branding.accent_color"] == {"old": "#FF2E4D", "new": "#00AAFF"}


def test_change_visible_to_other_process_snapshot():
    from apps.core.config import ConfigService

    other = ConfigService()
    assert other.get_int("content.row_item_limit") == 24
    config.set("content.row_item_limit", "30")
    other._checked_at = 0  # emulate the 1s local TTL elapsing
    assert other.get_int("content.row_item_limit") == 30


def test_secret_is_encrypted_at_rest_and_never_public(staff):
    config.set("storage.s3.secret_access_key", "super-secret-value", actor=staff)
    entry = ConfigEntry.objects.get(key="storage.s3.secret_access_key")
    assert entry.value is None
    assert "super-secret-value" not in entry.encrypted_value
    assert decrypt(entry.encrypted_value) == "super-secret-value"
    assert config.get_secret("storage.s3.secret_access_key") == "super-secret-value"
    assert "storage.s3.secret_access_key" not in config.public()
    log = AuditLog.objects.get(action="config.update")
    assert log.changes == {"storage.s3.secret_access_key": "changed (secret)"}
    assert "super-secret-value" not in str(log.changes)


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("branding.accent_color", "red"),
        ("auth.access_token_minutes", "abc"),
        ("auth.access_token_minutes", 0),
        ("content.default_translation_mode", "klingon"),
        ("transcoding.ladder", [{"name": "x"}]),
        ("security.rate_login", "lots"),
    ],
)
def test_validation_rejects_bad_values(key, value):
    with pytest.raises(ConfigValidationError):
        config.set(key, value)


def test_public_endpoint_only_exposes_public_keys(api):
    config.set("storage.s3.access_key_id", "AKIA_SHOULD_NOT_LEAK")
    response = api.get("/api/public/config")
    assert response.status_code == 200
    values = response.json()["values"]
    assert values["branding.site_name"] == "NETFLY"
    assert not any(k.startswith("storage.") for k in values)
    assert "AKIA_SHOULD_NOT_LEAK" not in response.content.decode()


def test_sigv4_presign_matches_botocore(monkeypatch):
    import botocore.auth

    from apps.core.storage import S3Settings, sigv4_presign

    s = S3Settings("my-bucket", "eu-west-1", "AKIDEXAMPLE", "wJalrXUtnFEMI/K7MDENG", "", "netfly/")
    signed_at = dt.datetime(2026, 1, 2, 3, 4, 5, tzinfo=dt.UTC)
    ours = sigv4_presign(s, "netfly/a b/seg_001.m4s", signed_at, 3600)

    request = AWSRequest(
        method="GET", url="https://my-bucket.s3.eu-west-1.amazonaws.com/netfly/a%20b/seg_001.m4s"
    )
    auth = S3SigV4QueryAuth(Credentials(s.access_key, s.secret_key), "s3", s.region, expires=3600)

    class FrozenDatetime(dt.datetime):
        @classmethod
        def utcnow(cls):
            return signed_at.replace(tzinfo=None)

        @classmethod
        def now(cls, tz=None):
            return signed_at if tz else signed_at.replace(tzinfo=None)

    monkeypatch.setattr(botocore.auth.datetime, "datetime", FrozenDatetime)
    auth.add_auth(request)
    sig = lambda url: url.split("X-Amz-Signature=")[1]  # noqa: E731
    assert "X-Amz-Date=20260102T030405Z" in ours
    assert sig(ours) == sig(request.url)


def test_host_and_cors_middleware(api):
    assert api.get("/api/health", HTTP_HOST="evil.example").status_code == 200
    assert api.get("/api/public/config", HTTP_HOST="evil.example").status_code == 400
    ok = api.get("/api/public/config", HTTP_ORIGIN="http://localhost:3000")
    assert ok["Access-Control-Allow-Origin"] == "http://localhost:3000"
    bad = api.get("/api/public/config", HTTP_ORIGIN="https://evil.example")
    assert "Access-Control-Allow-Origin" not in bad
