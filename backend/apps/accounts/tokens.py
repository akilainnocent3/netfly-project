"""Access tokens (JWT, short-lived) and rotating opaque refresh tokens."""

import datetime as dt
import hashlib
import secrets
from dataclasses import dataclass

import jwt
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.core.config import config

from .models import RefreshToken, User

ALGORITHM = "HS256"
ISSUER = "netfly"


def issue_access_token(user: User) -> tuple[str, int]:
    minutes = config.get_int("auth.access_token_minutes", 15)
    now = timezone.now()
    payload = {
        "iss": ISSUER,
        "sub": str(user.pk),
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(minutes=minutes)).timestamp()),
        "typ": "access",
        "ver": user.token_version,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM), minutes * 60


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[ALGORITHM],
        issuer=ISSUER,
        options={"require": ["exp", "sub"]},
    )
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@dataclass
class IssuedRefresh:
    raw: str
    record: RefreshToken


def issue_refresh_token(
    user: User,
    app: str,
    *,
    family=None,
    user_agent: str = "",
    ip: str | None = None,
    persistent: bool = True,
) -> IssuedRefresh:
    raw = secrets.token_urlsafe(48)
    days = config.get_int("auth.refresh_token_days", 30)
    record = RefreshToken.objects.create(
        user=user,
        token_hash=_hash(raw),
        app=app,
        expires_at=timezone.now() + dt.timedelta(days=days),
        user_agent=user_agent[:255],
        ip_address=ip,
        persistent=persistent,
        **({"family": family} if family else {}),
    )
    return IssuedRefresh(raw, record)


class RefreshError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def rotate_refresh_token(
    raw: str, app: str, *, user_agent: str = "", ip: str | None = None
) -> tuple[User, IssuedRefresh]:
    reused_family = None
    with transaction.atomic():
        record = (
            RefreshToken.objects.select_for_update()
            .select_related("user")
            .filter(token_hash=_hash(raw))
            .first()
        )
        now = timezone.now()
        if record is None or record.app != app:
            raise RefreshError("invalid_refresh", "Your session has ended. Please log in again.")
        grace = config.get_int("auth.refresh_reuse_grace_seconds", 20)
        if (
            record.used_at
            and not record.revoked_at
            and grace > 0
            and (now - record.used_at).total_seconds() <= grace
            and record.user_agent == user_agent[:255]
            and record.expires_at > now
            and record.user.is_active
            and not RefreshToken.objects.filter(
                family=record.family, revoked_at__isnull=False
            ).exists()
        ):
            # The same browser presenting a token it rotated seconds ago: the response carrying
            # the new cookie was lost (navigation aborted it, or two tabs refreshed at once).
            # Not theft — issue another token in the same family instead of revoking it.
            issued = issue_refresh_token(
                record.user,
                app,
                family=record.family,
                user_agent=user_agent,
                ip=ip,
                persistent=record.persistent,
            )
            return record.user, issued
        if record.used_at or record.revoked_at:
            reused_family = record.family
        elif record.expires_at <= now or not record.user.is_active:
            raise RefreshError("refresh_expired", "Your session has expired. Please log in again.")
        else:
            record.used_at = now
            record.save(update_fields=["used_at"])
            issued = issue_refresh_token(
                record.user,
                app,
                family=record.family,
                user_agent=user_agent,
                ip=ip,
                persistent=record.persistent,
            )
            return record.user, issued
    # Reuse of a rotated/revoked token: assume theft and kill the whole family
    # (committed outside the transaction above so the raise can't roll it back).
    RefreshToken.objects.filter(family=reused_family, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )
    raise RefreshError("refresh_reused", "Your session has ended. Please log in again.")


def revoke_refresh_token(raw: str, app: str | None = None) -> None:
    records = RefreshToken.objects.filter(token_hash=_hash(raw))
    record = (records.filter(app=app) if app else records).first()
    if record:
        RefreshToken.objects.filter(family=record.family, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )


def revoke_all_for_user(user: User) -> None:
    RefreshToken.objects.filter(user=user, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )
