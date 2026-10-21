"""Viewing-time metering: windows, allowance, playback leases and heartbeats.

* Windows (day / week / month) are computed from the clock in `usage.timezone` — resets need
  no cron. The month is the calendar month or the member's billing period.
* Allowance = the plan's limit (read live) + staff bonus for that window bucket.
* Usage is credited only by the server: each heartbeat credits
  min(time the client reports, server time since the previous beat + tolerance), and only for
  a playback session this user was issued. Pauses, seeks, 2x speed or a tampered client can't
  inflate or dodge it; concurrent streams each count their own time.
* Redis holds fast counters (rebuilt from the ledger when missing); the ledger is the truth.
"""

from __future__ import annotations

import datetime as dt
import json
import time
from dataclasses import dataclass
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from apps.core.config import config
from apps.core.redis import get_redis

from .models import Subscription, UsageAdjustment, UsageLedger
from .plans import effective_plan, ensure_subscription

SCOPES = ("day", "week", "month")
WEEKDAYS = {"monday": 0, "sunday": 6, "saturday": 5}
SESSION_TTL = 24 * 3600


@dataclass(frozen=True)
class Window:
    key: str
    start: dt.datetime
    end: dt.datetime


def tz() -> ZoneInfo:
    try:
        return ZoneInfo(config.get_str("usage.timezone", "Africa/Dar_es_Salaam"))
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _midnight(day: dt.date, zone: ZoneInfo) -> dt.datetime:
    return dt.datetime(day.year, day.month, day.day, tzinfo=zone)


def windows(sub: Subscription | None = None, now: dt.datetime | None = None) -> dict[str, Window]:
    zone = tz()
    local = (now or timezone.now()).astimezone(zone)
    today = local.date()
    day = Window(
        f"d{today.isoformat()}", _midnight(today, zone), _midnight(today + dt.timedelta(1), zone)
    )
    first = WEEKDAYS.get(config.get_str("usage.week_starts_on", "monday"), 0)
    week_start = today - dt.timedelta(days=(today.weekday() - first) % 7)
    week = Window(
        f"w{week_start.isoformat()}",
        _midnight(week_start, zone),
        _midnight(week_start + dt.timedelta(7), zone),
    )
    if (
        config.get_str("usage.monthly_reset", "calendar_month") == "billing_period"
        and sub is not None
        and sub.current_period_start
        and sub.current_period_end
        and sub.current_period_start <= local <= sub.current_period_end
    ):
        month = Window(
            f"p{sub.current_period_start.astimezone(zone):%Y%m%d%H%M}",
            sub.current_period_start,
            sub.current_period_end,
        )
    else:
        start = today.replace(day=1)
        nxt = (start + dt.timedelta(days=32)).replace(day=1)
        month = Window(f"m{start:%Y-%m}", _midnight(start, zone), _midnight(nxt, zone))
    return {"day": day, "week": week, "month": month}


def _counter_key(user_id: int, scope: str, bucket: str) -> str:
    return f"usage:{user_id}:{scope}:{bucket}"


def used_seconds(user_id: int, wins: dict[str, Window]) -> dict[str, float]:
    """Seconds used per window: Redis first, rebuilt from the ledger when a key is missing."""
    r = get_redis()
    keys = [_counter_key(user_id, s, wins[s].key) for s in SCOPES]
    values = r.mget(keys)
    out: dict[str, float] = {}
    field = {"day": "day_key", "week": "week_key", "month": "month_key"}
    for scope, key, raw in zip(SCOPES, keys, values, strict=True):
        if raw is not None:
            out[scope] = float(raw)
            continue
        total = (
            UsageLedger.objects.filter(
                user_id=user_id, **{field[scope]: wins[scope].key}
            ).aggregate(s=Sum("credited_seconds"))["s"]
            or 0.0
        )
        ttl = max(60, int((wins[scope].end - timezone.now()).total_seconds()) + 2 * 86400)
        r.set(key, total, ex=ttl, nx=True)
        out[scope] = float(r.get(key) or total)
    return out


def bonus_seconds(user_id: int, wins: dict[str, Window]) -> dict[str, int]:
    rows = UsageAdjustment.objects.filter(
        user_id=user_id,
        **{"scope__in": SCOPES, "bucket__in": [wins[s].key for s in SCOPES]},
    ).values_list("scope", "bucket", "seconds")
    out = {s: 0 for s in SCOPES}
    for scope, bucket, seconds in rows:
        if wins[scope].key == bucket:
            out[scope] += seconds
    return out


def is_exempt(user) -> bool:
    """Staff accounts are never limited."""
    return bool(getattr(user, "is_staff", False))


def snapshot(user, *, sub: Subscription | None = None, now: dt.datetime | None = None) -> dict:
    """Everything the UI needs: limits, used, remaining, reset times, warnings."""
    sub = sub or ensure_subscription(user)
    plan = effective_plan(sub, now)
    wins = windows(sub, now)
    exempt = is_exempt(user)
    used = used_seconds(user.pk, wins)
    bonus = bonus_seconds(user.pk, wins)
    limits = plan.limits()
    remaining: dict[str, int | None] = {}
    limit_seconds: dict[str, int | None] = {}
    for scope in SCOPES:
        minutes = limits[scope]
        if exempt or minutes is None:
            limit_seconds[scope] = None
            remaining[scope] = None
        else:
            cap = minutes * 60 + bonus[scope]
            limit_seconds[scope] = cap
            remaining[scope] = max(0, int(cap - used[scope]))
    finite = [v for v in remaining.values() if v is not None]
    left = min(finite) if finite else None
    blocking = None
    if left is not None and left <= 0:
        blocking = next(s for s in SCOPES if remaining[s] is not None and remaining[s] <= 0)
    return {
        "plan": {"slug": plan.slug, "name": plan.name, "is_free": plan.is_free},
        "exempt": exempt,
        "allowed": left is None or left > 0,
        "limit_reached": blocking,
        "limits": limit_seconds,
        "used": {s: int(used[s]) for s in SCOPES},
        "remaining": remaining,
        "remaining_seconds": left,
        "resets_at": {s: wins[s].end.isoformat() for s in SCOPES},
        "warn_at_minutes": config.get_json("usage.warn_at_minutes") or [10, 2],
        "heartbeat_seconds": config.get_int("usage.heartbeat_seconds", 30),
        "server_time": (now or timezone.now()).isoformat(),
        # A one-time billing notice ("…you're on the free plan now"), until dismissed.
        "notice": (
            {"text": sub.notice, "at": sub.notice_at.isoformat()}
            if sub.notice and sub.notice_at
            else None
        ),
    }


# -- playback sessions & leases -------------------------------------------------------
def _session_key(session_id: str) -> str:
    return f"usage:session:{session_id}"


def _lease_key(session_id: str) -> str:
    return f"usage:lease:{session_id}"


def lease_ttl() -> int:
    return config.get_int("usage.heartbeat_seconds", 30) * 10


def open_session(
    session_id: str, *, user_id: int, title_id: int, episode_id: int | None, metered: bool
) -> None:
    """Called when a playback session is issued: proves later heartbeats belong to this user."""
    r = get_redis()
    data = json.dumps(
        {"u": user_id, "t": title_id, "e": episode_id, "m": metered, "at": time.time()}
    )
    pipe = r.pipeline()
    pipe.set(_session_key(session_id), data, ex=SESSION_TTL)
    pipe.set(_lease_key(session_id), time.time(), ex=lease_ttl())
    pipe.execute()


def _credit(user_id: int, session: dict, session_id: str, seconds: float, sub, now) -> None:
    wins = windows(sub, now)
    started = dt.datetime.fromtimestamp(session["at"], tz=dt.UTC)
    with transaction.atomic():
        row, _ = UsageLedger.objects.get_or_create(
            session_id=session_id,
            day_key=wins["day"].key,
            defaults={
                "user_id": user_id,
                "title_id": session["t"],
                "episode_id": session["e"],
                "started_at": started,
                "week_key": wins["week"].key,
                "month_key": wins["month"].key,
            },
        )
        UsageLedger.objects.filter(pk=row.pk).update(
            credited_seconds=F("credited_seconds") + seconds
        )
    # Make sure the counters exist (rebuilt from the ledger *before* this credit), then add.
    r = get_redis()
    keys = [_counter_key(user_id, s, wins[s].key) for s in SCOPES]
    if any(v is None for v in r.mget(keys)):
        # The ledger already holds this credit: rebuild without it, then add it below once.
        _rebuild(user_id, wins, minus=seconds)
    pipe = r.pipeline()
    for scope, key in zip(SCOPES, keys, strict=True):
        pipe.incrbyfloat(key, seconds)
        pipe.expire(key, max(60, int((wins[scope].end - now).total_seconds()) + 2 * 86400))
    pipe.execute()


def _rebuild(user_id: int, wins: dict[str, Window], *, minus: float = 0.0) -> None:
    r = get_redis()
    field = {"day": "day_key", "week": "week_key", "month": "month_key"}
    for scope in SCOPES:
        key = _counter_key(user_id, scope, wins[scope].key)
        if r.get(key) is not None:
            continue
        total = (
            UsageLedger.objects.filter(
                user_id=user_id, **{field[scope]: wins[scope].key}
            ).aggregate(s=Sum("credited_seconds"))["s"]
            or 0.0
        )
        r.set(key, max(0.0, total - minus), nx=True)


class HeartbeatError(Exception):
    def __init__(self, code: str, message: str, status: int = 409):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def heartbeat(user, session_id: str, *, watched: float, playing: bool) -> dict:
    """Credit server-verified viewing time for a session and return the fresh snapshot."""
    r = get_redis()
    raw = r.get(_session_key(session_id))
    if raw is None:
        raise HeartbeatError("invalid_session", "This playback session isn't valid anymore.", 409)
    session = json.loads(raw)
    if session.get("u") != user.pk:
        raise HeartbeatError("invalid_session", "This playback session isn't valid anymore.", 409)
    now_ts = time.time()
    last = r.set(_lease_key(session_id), now_ts, ex=lease_ttl(), get=True)
    tolerance = config.get_int("usage.tolerance_seconds", 5)
    if last is None:
        # The lease lapsed (long pause, sleeping device): restart timing, credit nothing unseen.
        elapsed = 0.0
    else:
        elapsed = max(0.0, now_ts - float(last))
    reported = watched if watched == watched and watched > 0 else 0.0  # NaN / negative → 0
    credited = min(reported, elapsed + tolerance) if playing else 0.0
    sub = ensure_subscription(user)
    now = timezone.now()
    if credited > 0 and session.get("m", True):
        _credit(user.pk, session, session_id, credited, sub, now)
    snap = snapshot(user, sub=sub, now=now)
    snap["credited"] = round(credited, 2)
    return snap


def close_session(session_id: str) -> None:
    get_redis().delete(_lease_key(session_id))


def reset(user, *, actor, scopes=SCOPES, reason: str = "") -> list[UsageAdjustment]:
    """Studio: give back everything used in the current windows (as a bonus, so it's audited)."""
    sub = ensure_subscription(user)
    wins = windows(sub)
    used = used_seconds(user.pk, wins)
    bonus = bonus_seconds(user.pk, wins)
    rows = []
    plan = effective_plan(sub)
    for scope in scopes:
        minutes = plan.limits()[scope]
        if minutes is None:
            continue
        cap = minutes * 60 + bonus[scope]
        give = int(max(0, used[scope] - (cap - minutes * 60)))
        if give > 0:
            rows.append(
                UsageAdjustment.objects.create(
                    user=user,
                    scope=scope,
                    bucket=wins[scope].key,
                    seconds=give,
                    kind="reset",
                    reason=reason[:200],
                    actor=actor,
                )
            )
    return rows


def grant_bonus(user, minutes: int, scope: str, *, actor, reason: str = "") -> UsageAdjustment:
    sub = ensure_subscription(user)
    wins = windows(sub)
    return UsageAdjustment.objects.create(
        user=user,
        scope=scope,
        bucket=wins[scope].key,
        seconds=int(minutes) * 60,
        kind="bonus",
        reason=reason[:200],
        actor=actor,
    )


def purge_stale_keys(batch: int = 1000) -> int:
    """Beat task: drop counter keys of windows that ended (their TTL normally handles it)."""
    r = get_redis()
    removed = 0
    today = timezone.now().astimezone(tz()).date()
    for key in r.scan_iter(match="usage:*:day:d*", count=batch):
        name = key.decode() if isinstance(key, bytes) else key
        try:
            day = dt.date.fromisoformat(name.rsplit(":d", 1)[1])
        except ValueError:
            continue
        if (today - day).days > 3:
            r.delete(key)
            removed += 1
    return removed
