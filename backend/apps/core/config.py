"""Database-backed configuration with typed getters.

The full config table is small, so the service keeps one snapshot of it:

* the snapshot lives in Redis (shared by every web process and worker);
* each process memoises it locally and re-checks a Redis version counter at
  most once per ``LOCAL_TTL`` seconds, so a change made in the admin app is
  visible everywhere within about a second, with no restart.

Secrets are stored Fernet-encrypted and only decrypted on ``get_secret``.
"""

from __future__ import annotations

import json
import re
import threading
import time
from typing import Any

import jsonschema
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.cache import cache

from .config_defaults import KEY_INDEX

SNAPSHOT_KEY = "config:snapshot"
VERSION_KEY = "config:version"
LOCAL_TTL = 1.0


class ConfigValidationError(ValueError):
    pass


_fernet: Fernet | None = None


def fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(settings.CONFIG_ENCRYPTION_KEY.encode())
    return _fernet


def encrypt(plaintext: str) -> str:
    return fernet().encrypt(plaintext.encode()).decode() if plaintext else ""


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        # Wrong CONFIG_ENCRYPTION_KEY: behave as "not configured" rather than crash.
        return ""


def coerce(value_type: str, raw: Any) -> Any:
    """Convert an incoming value (often a string from a form) to its stored type."""
    if raw is None:
        return None
    if value_type == "int":
        if isinstance(raw, bool):
            raise ConfigValidationError("Expected a whole number")
        try:
            if isinstance(raw, float) and not raw.is_integer():
                raise ValueError
            return int(raw)
        except (TypeError, ValueError) as exc:
            raise ConfigValidationError("Expected a whole number") from exc
    if value_type == "float":
        try:
            return float(raw)
        except (TypeError, ValueError) as exc:
            raise ConfigValidationError("Expected a number") from exc
    if value_type == "bool":
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str) and raw.lower() in {"true", "1", "yes", "on"}:
            return True
        if isinstance(raw, str) and raw.lower() in {"false", "0", "no", "off"}:
            return False
        raise ConfigValidationError("Expected true or false")
    if value_type == "json":
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ConfigValidationError(f"Invalid JSON: {exc.msg}") from exc
        return raw
    if not isinstance(raw, str):
        raise ConfigValidationError("Expected text")
    return raw.strip() if value_type != "text" else raw


def validate(value_type: str, value: Any, rules: dict) -> None:
    if value is None:
        return
    if value_type == "color" and not re.fullmatch(r"#[0-9a-fA-F]{6}", value or ""):
        raise ConfigValidationError("Use a hex color like #FF2E4D")
    if value_type == "url" and value and not re.match(r"^https?://", value):
        raise ConfigValidationError("Must start with http:// or https://")
    if value_type == "enum" and rules.get("choices") and value not in rules["choices"]:
        raise ConfigValidationError(f"Must be one of: {', '.join(map(str, rules['choices']))}")
    if "regex" in rules and value_type != "color" and not re.fullmatch(rules["regex"], str(value)):
        raise ConfigValidationError("Value has the wrong format")
    if value_type in {"int", "float"}:
        if "min" in rules and value < rules["min"]:
            raise ConfigValidationError(f"Must be at least {rules['min']}")
        if "max" in rules and value > rules["max"]:
            raise ConfigValidationError(f"Must be at most {rules['max']}")
    if "schema" in rules:
        try:
            jsonschema.validate(value, rules["schema"])
        except jsonschema.ValidationError as exc:
            path = "/".join(str(p) for p in exc.absolute_path)
            raise ConfigValidationError(f"{path + ': ' if path else ''}{exc.message}") from exc


class ConfigService:
    def __init__(self) -> None:
        self._local: dict[str, dict] | None = None
        self._local_version: int | None = None
        self._checked_at = 0.0
        self._lock = threading.Lock()

    # -- snapshot management -------------------------------------------------
    def _build_snapshot(self) -> dict[str, dict]:
        from .models import ConfigEntry

        snap: dict[str, dict] = {}
        for e in ConfigEntry.objects.all().only(
            "key", "value_type", "value", "encrypted_value", "is_secret", "is_public"
        ):
            snap[e.key] = {
                "t": e.value_type,
                "v": e.value,
                "e": e.encrypted_value if e.is_secret else "",
                "s": e.is_secret,
                "p": e.is_public,
            }
        return snap

    def _snapshot(self) -> dict[str, dict]:
        now = time.monotonic()
        if self._local is not None and now - self._checked_at < LOCAL_TTL:
            return self._local
        with self._lock:
            version = cache.get(VERSION_KEY)
            if self._local is not None and version is not None and version == self._local_version:
                self._checked_at = now
                return self._local
            snap = cache.get(SNAPSHOT_KEY)
            if snap is None:
                snap = self._build_snapshot()
                if version is None:
                    version = int(time.time() * 1000)
                    cache.set(VERSION_KEY, version, None)
                cache.set(SNAPSHOT_KEY, snap, None)
            self._local, self._local_version, self._checked_at = snap, version, now
            return snap

    def invalidate(self) -> None:
        cache.delete(SNAPSHOT_KEY)
        cache.set(VERSION_KEY, int(time.time() * 1000), None)
        self._local = None

    # -- getters -------------------------------------------------------------
    def get(self, key: str, default: Any = None) -> Any:
        item = self._snapshot().get(key)
        if item is not None and not item["s"] and item["v"] is not None:
            return item["v"]
        spec = KEY_INDEX.get(key)
        if spec is not None and spec.type != "secret":
            return spec.default
        return default

    def get_str(self, key: str, default: str = "") -> str:
        value = self.get(key, default)
        return "" if value is None else str(value)

    def get_int(self, key: str, default: int = 0) -> int:
        try:
            return int(self.get(key, default))
        except (TypeError, ValueError):
            return default

    def get_float(self, key: str, default: float = 0.0) -> float:
        try:
            return float(self.get(key, default))
        except (TypeError, ValueError):
            return default

    def get_bool(self, key: str, default: bool = False) -> bool:
        return bool(self.get(key, default))

    def get_json(self, key: str, default: Any = None) -> Any:
        return self.get(key, default)

    def get_secret(self, key: str) -> str:
        item = self._snapshot().get(key)
        return decrypt(item["e"]) if item and item["s"] else ""

    def public(self) -> dict[str, Any]:
        """All `is_public` values (registry defaults filled in). Never includes secrets."""
        out: dict[str, Any] = {}
        snap = self._snapshot()
        for key, spec in KEY_INDEX.items():
            if spec.public and spec.type != "secret":
                out[key] = self.get(key)
        for key, item in snap.items():
            if item["p"] and not item["s"] and key not in out:
                out[key] = item["v"]
        return out

    # -- writes --------------------------------------------------------------
    def set(self, key: str, raw: Any, *, actor=None, ip: str | None = None) -> None:
        """Validate and store a value, writing an audit entry. Raises ConfigValidationError."""
        from .audit import record
        from .models import ConfigEntry

        entry = ConfigEntry.objects.select_related("group").get(key=key)
        if entry.is_secret:
            new_plain = "" if raw is None else str(raw)
            changed = new_plain != decrypt(entry.encrypted_value)
            entry.encrypted_value = encrypt(new_plain)
            entry.updated_by = actor
            entry.save(update_fields=["encrypted_value", "updated_by", "updated_at"])
            if changed:
                record(actor, "config.update", entry, changes={key: "changed (secret)"}, ip=ip)
            return
        value = coerce(entry.value_type, raw)
        validate(entry.value_type, value, entry.validation or {})
        old = entry.value
        entry.value = value
        entry.updated_by = actor
        entry.save(update_fields=["value", "updated_by", "updated_at"])
        if old != value:
            record(actor, "config.update", entry, changes={key: {"old": old, "new": value}}, ip=ip)


config = ConfigService()
