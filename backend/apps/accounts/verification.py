"""Email and phone verification codes, and password-reset codes.

* We generate the code (or Beem's OTP API does, `sms.otp_provider = beem_otp`); only an HMAC of it
  is stored. Each code has an expiry and its own attempt limit; asking for a new one replaces the
  old one. Sends are rate limited per account (cooldown), per address/number (hourly) and per IP
  (the views' throttles).
* Codes and message bodies are never logged.
* A verified email / phone belongs to one account. Verifying an address that another account
  claimed but never verified releases it from that account.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import logging
import math
import re
import secrets
from dataclasses import dataclass

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.audit import record
from apps.core.config import config
from apps.core.redis import get_redis
from apps.messaging import email as mail
from apps.messaging import sms
from apps.messaging.errors import MessagingError

from . import phone as phones
from .models import User, VerificationCode

log = logging.getLogger(__name__)
Channel = VerificationCode.Channel
Purpose = VerificationCode.Purpose


@dataclass(frozen=True)
class ChannelSettings:
    length: int
    ttl: int
    attempts: int
    cooldown: int
    hourly: int


def channel_settings(channel: str) -> ChannelSettings:
    if channel == Channel.EMAIL:
        return ChannelSettings(
            length=config.get_int("email.code_length", 6),
            ttl=config.get_int("email.code_ttl_seconds", 600),
            attempts=config.get_int("email.code_max_attempts", 5),
            cooldown=config.get_int("email.resend_cooldown_seconds", 60),
            hourly=config.get_int("email.max_sends_per_hour", 5),
        )
    return ChannelSettings(
        length=config.get_int("sms.otp_length", 6),
        ttl=config.get_int("sms.otp_ttl_seconds", 300),
        attempts=config.get_int("sms.otp_max_attempts", 5),
        cooldown=config.get_int("sms.otp_resend_cooldown_seconds", 60),
        hourly=config.get_int("sms.max_sends_per_phone_per_hour", 5),
    )


class VerificationError(Exception):
    def __init__(
        self,
        message: str,
        code: str,
        status: int = 400,
        *,
        field: str | None = None,
        extra: dict | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.field = field
        self.extra = extra or {}


# -- helpers ----------------------------------------------------------------------------
def normalize_target(channel: str, raw: str) -> str:
    value = (raw or "").strip()
    if channel == Channel.EMAIL:
        value = value.lower()
        try:
            validate_email(value)
        except ValidationError as exc:
            raise VerificationError(
                "Enter a valid email address.", "validation_error", field="value"
            ) from exc
        if len(value) > 254:
            raise VerificationError("That email is too long.", "validation_error", field="value")
        return value
    try:
        return phones.normalize(value)
    except ValueError as exc:
        raise VerificationError(str(exc), "validation_error", field="value") from exc


def mask(channel: str, target: str) -> str:
    if channel == Channel.PHONE:
        return phones.masked(target)
    local, _, domain = target.partition("@")
    return f"{local[:1]}•••{local[-1:] if len(local) > 2 else ''}@{domain}"


def _hash(channel: str, target: str, code: str) -> str:
    message = f"{channel}:{target}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


def _generate(length: int) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


class _Placeholders(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def _render(template: str, fallback: str, **values) -> str:
    """Fill {code}, {name}… leaving unknown placeholders as typed; a broken template falls back."""
    try:
        return template.format_map(_Placeholders(values))
    except (ValueError, IndexError, AttributeError):
        return fallback.format_map(_Placeholders(values))


def _site_name() -> str:
    return config.get_str("branding.site_name", "NETFLY") or "NETFLY"


def _webotp_domain(host: str) -> str:
    domain = config.get_str("sms.webotp_domain")
    if domain:
        return domain
    # The domain the viewer is on (the API is served same-origin through the app).
    return (host or "").split(",")[0].strip().lower()


def _cooldown_left(user: User, channel: str, purpose: str, cooldown: int) -> int:
    last = (
        VerificationCode.objects.filter(user=user, channel=channel, purpose=purpose)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )
    if last is None:
        return 0
    return max(0, math.ceil(cooldown - (timezone.now() - last).total_seconds()))


def _within_hourly_cap(channel: str, target: str, cap: int) -> bool:
    digest = hashlib.sha256(target.encode()).hexdigest()[:24]
    key = f"verify:sent:{channel}:{digest}"
    r = get_redis()
    count = r.incr(key)
    if count == 1:
        r.expire(key, 3600)
    return count <= cap


def _deliver(channel: str, target: str, code: str, *, user: User, minutes: int, host: str) -> str:
    """Send the code; returns the provider reference (Beem pin id for beem_otp, else "")."""
    site = _site_name()
    if channel == Channel.EMAIL:
        default_subject = "{code} is your {site_name} verification code"
        default_body = (
            "Your {site_name} verification code is {code}. It expires in {minutes} minutes."
        )
        values = {"code": code, "name": user.full_name, "site_name": site, "minutes": minutes}
        subject = _render(
            config.get_str("email.code_subject", default_subject), default_subject, **values
        )
        body = _render(config.get_str("email.code_body", default_body), default_body, **values)
        mail.send(target, subject.replace("\n", " ")[:200], body)
        return ""
    if config.get_str("sms.otp_provider", "own") == "beem_otp":
        return sms.otp_request(target)
    default = "{code} is your {site_name} verification code. It expires in {minutes} min.\n\n@{domain} #{code}"
    text = _render(
        config.get_str("sms.otp_template", default),
        default,
        code=code,
        site_name=site,
        minutes=minutes,
        domain=_webotp_domain(host),
    )
    sms.send(target, text)
    return ""


# -- issuing and checking codes ------------------------------------------------------------
def start(
    user: User,
    channel: str,
    raw_target: str,
    *,
    purpose: str = Purpose.VERIFY,
    ip: str | None = None,
    host: str = "",
) -> dict:
    """Send a code to `raw_target` for `user`. Returns what the code screen needs."""
    target = normalize_target(channel, raw_target)
    noun = "email" if channel == Channel.EMAIL else "phone number"
    if purpose == Purpose.VERIFY:
        mine = user.email if channel == Channel.EMAIL else user.phone
        verified = user.email_verified if channel == Channel.EMAIL else user.phone_verified
        if verified and (mine or "").lower() == target:
            raise VerificationError(f"This {noun} is already verified.", "already_verified", 409)
        others = User.objects.exclude(pk=user.pk)
        taken = (
            others.filter(email__iexact=target, email_verified_at__isnull=False)
            if channel == Channel.EMAIL
            else others.filter(phone=target, phone_verified_at__isnull=False)
        ).exists()
        if taken:
            raise VerificationError(
                f"This {noun} is already used by another account.", "taken", 409, field="value"
            )
    cfg = channel_settings(channel)
    left = _cooldown_left(user, channel, purpose, cfg.cooldown)
    if left:
        raise VerificationError(
            f"Please wait {left} seconds before asking for another code.",
            "resend_cooldown",
            429,
            extra={"retry_in": left},
        )
    if not _within_hourly_cap(channel, target, cfg.hourly):
        raise VerificationError(
            f"Too many codes were sent to this {noun}. Try again in an hour.",
            "too_many_codes",
            429,
        )
    code = _generate(cfg.length)
    minutes = max(1, math.ceil(cfg.ttl / 60))
    try:
        provider_ref = _deliver(channel, target, code, user=user, minutes=minutes, host=host)
    except MessagingError as exc:
        log.warning("verification send failed: channel=%s reason=%s", channel, exc.code)
        raise VerificationError(
            "We couldn't send the code right now. Please try again in a moment.",
            "send_failed",
            502,
        ) from exc
    now = timezone.now()
    with transaction.atomic():
        VerificationCode.objects.filter(
            user=user, channel=channel, purpose=purpose, consumed_at__isnull=True
        ).update(consumed_at=now)
        VerificationCode.objects.create(
            user=user,
            channel=channel,
            purpose=purpose,
            target=target,
            code_hash="" if provider_ref else _hash(channel, target, code),
            provider_ref=provider_ref,
            max_attempts=cfg.attempts,
            expires_at=now + dt.timedelta(seconds=cfg.ttl),
            ip_address=ip,
        )
    return {
        "channel": channel,
        "target": target,
        "sent_to": mask(channel, target),
        "expires_in": cfg.ttl,
        "resend_in": cfg.cooldown,
        "length": cfg.length,
        "network": phones.network(target) if channel == Channel.PHONE else None,
    }


def pending(user: User, channel: str, purpose: str = Purpose.VERIFY) -> dict | None:
    """The live (unexpired, unused) code for this channel, for the code screen after a reload."""
    row = (
        VerificationCode.objects.filter(
            user=user,
            channel=channel,
            purpose=purpose,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )
    if row is None or row.attempts >= row.max_attempts:
        return None
    cfg = channel_settings(channel)
    now = timezone.now()
    return {
        "channel": channel,
        "target": row.target,
        "sent_to": mask(channel, row.target),
        "expires_in": max(0, int((row.expires_at - now).total_seconds())),
        "resend_in": _cooldown_left(user, channel, purpose, cfg.cooldown),
        "length": cfg.length,
        "network": phones.network(row.target) if channel == Channel.PHONE else None,
    }


def _check(row: VerificationCode, code: str) -> bool:
    if row.provider_ref:
        try:
            return sms.otp_verify(row.provider_ref, code)
        except MessagingError as exc:
            raise VerificationError(
                "We couldn't check the code right now. Please try again.", "send_failed", 502
            ) from exc
    return hmac.compare_digest(row.code_hash, _hash(row.channel, row.target, code))


def check(
    user: User, code: str, *, channel: str | None, purpose: str = Purpose.VERIFY
) -> VerificationCode:
    """Consume the latest code if `code` matches; otherwise count the attempt and explain."""
    digits = re.sub(r"\D", "", code or "")
    qs = VerificationCode.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True)
    if channel:
        qs = qs.filter(channel=channel)
    with transaction.atomic():
        row = qs.select_for_update().order_by("-created_at").first()
        if row is None:
            raise VerificationError("Ask for a new code first.", "no_code", 400)
        if row.expires_at <= timezone.now():
            raise VerificationError("That code has expired. Ask for a new one.", "code_expired")
        if row.attempts >= row.max_attempts:
            raise VerificationError(
                "Too many wrong tries. Ask for a new code.", "too_many_attempts", 429
            )
        ok = bool(digits) and _check(row, digits)
        if ok:
            row.consumed_at = timezone.now()
        else:
            row.attempts += 1
        row.save(update_fields=["consumed_at", "attempts"])
    if not ok:
        left = row.max_attempts - row.attempts
        raise VerificationError(
            "That code isn't right."
            + (f" {left} {'try' if left == 1 else 'tries'} left." if 0 < left <= 3 else "")
            + (" Ask for a new code." if left <= 0 else ""),
            "invalid_code",
            400,
            field="code",
            extra={"attempts_left": max(0, left)},
        )
    return row


def confirm(user: User, channel: str, code: str, *, ip: str | None = None) -> User:
    """Check a verification code and mark the email / phone as verified on the account."""
    row = check(user, code, channel=channel)
    now = timezone.now()
    try:
        with transaction.atomic():
            others = User.objects.exclude(pk=user.pk)
            if channel == Channel.EMAIL:
                # An address another account claimed but never verified is released.
                others.filter(email__iexact=row.target, email_verified_at__isnull=True).update(
                    email=None
                )
                user.email, user.email_verified_at = row.target, now
                fields = ["email", "email_verified_at"]
            else:
                others.filter(phone=row.target, phone_verified_at__isnull=True).update(phone=None)
                user.phone, user.phone_verified_at = row.target, now
                fields = ["phone", "phone_verified_at"]
            user.save(update_fields=fields)
    except IntegrityError as exc:
        raise VerificationError(
            "This is already used by another account.", "taken", 409, field="value"
        ) from exc
    record(
        user,
        f"account.{channel}_verified",
        user,
        changes={channel: mask(channel, row.target)},
        ip=ip,
    )
    return user


# -- password reset ------------------------------------------------------------------------
RESET_TTL = 3600


def reset_start(identifier: str, *, ip: str | None = None, host: str = "") -> str:
    """Send a reset code to the account's verified phone (else email). Always returns a token,
    whether or not an account matched, so the response never reveals who has an account."""
    from .views import find_login_user

    token = secrets.token_urlsafe(24)
    user = find_login_user(identifier or "")
    target_channel = None
    if user is not None and user.is_active:
        value = (identifier or "").strip()
        if "@" in value and user.email_verified:
            target_channel = Channel.EMAIL
        elif user.phone_verified:
            target_channel = Channel.PHONE
        elif user.email_verified:
            target_channel = Channel.EMAIL
    get_redis().set(f"reset:{token}", user.pk if target_channel else 0, ex=RESET_TTL)
    if target_channel:
        target = user.email if target_channel == Channel.EMAIL else user.phone
        try:
            start(user, target_channel, target, purpose=Purpose.RESET, ip=ip, host=host)
        except VerificationError as exc:
            # Cooldowns and hourly caps stay silent (the last code still works).
            if exc.code == "send_failed":
                raise
    return token


def reset_user(token: str) -> User | None:
    raw = get_redis().get(f"reset:{token}") if token else None
    pk = int(raw) if raw else 0
    return User.objects.filter(pk=pk, is_active=True).first() if pk else None


def reset_confirm(token: str, code: str, new_password: str, *, ip: str | None = None) -> User:
    from . import lockout
    from .tokens import revoke_all_for_user

    user = reset_user(token)
    if user is None:
        raise VerificationError("That code isn't right.", "invalid_code", 400, field="code")
    check(user, code, channel=None, purpose=Purpose.RESET)
    user.set_password(new_password)
    user.token_version += 1
    user.save(update_fields=["password", "token_version"])
    revoke_all_for_user(user)
    lockout.clear(f"user:{user.pk}")
    get_redis().delete(f"reset:{token}")
    record(user, "account.password_reset", user, ip=ip)
    return user
