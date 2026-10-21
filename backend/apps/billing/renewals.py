"""Renewals and trial conversions (Celery beat, every few minutes; idempotent).

For each paid subscription that renews (auto_renew on):

    due = trial_end (trials) or period_end − payments.renewal_lead_hours
    attempt n is pushed at due + payments.retry_schedule_hours[n] (attempt 0 also sends the
    reminder SMS), never while another request is still pending
    period end passes unpaid → grace until end + payments.grace_days (limits kept)
    grace ends unpaid        → the free plan (status expired) + SMS + in-app notice

A subscription with auto-renew off (cancelled) — or a scheduled downgrade to the free plan —
simply moves to the free plan when its period ends. Each subscription is handled under a lock,
so overlapping beat runs never double-charge.
"""

from __future__ import annotations

import datetime as dt
import logging

from django.db import transaction
from django.utils import timezone

from apps.accounts.phone import masked
from apps.core.config import config
from apps.core.redis import get_redis

from . import payments as pay
from . import plans as plan_service
from .models import Payment, Subscription

log = logging.getLogger(__name__)
S = Subscription.Status
RENEWING = (S.ACTIVE, S.TRIALING, S.PAST_DUE, S.GRACE, S.CANCELED)


def _lock(sub_id: int) -> bool:
    return bool(get_redis().set(f"lock:renewal:{sub_id}", 1, nx=True, ex=300))


def _unlock(sub_id: int) -> None:
    get_redis().delete(f"lock:renewal:{sub_id}")


def run(now: dt.datetime | None = None) -> dict[str, int]:
    now = now or timezone.now()
    counts = {"charged": 0, "reminded": 0, "grace": 0, "ended": 0}
    ids = Subscription.objects.filter(plan__is_free=False, status__in=RENEWING).values_list(
        "pk", flat=True
    )
    for sub_id in ids:
        if not _lock(sub_id):
            continue
        try:
            result = process(sub_id, now)
        except Exception:  # noqa: BLE001 - one bad row must not stop the others
            log.exception("renewal failed for subscription %s", sub_id)
            result = None
        finally:
            _unlock(sub_id)
        for key in result or ():
            counts[key] += 1
    return counts


def _end(sub: Subscription) -> dt.datetime | None:
    return (
        sub.trial_end
        if sub.status == S.TRIALING or (sub.trial_end and sub.current_period_end == sub.trial_end)
        else sub.current_period_end
    )


def process(sub_id: int, now: dt.datetime) -> list[str]:
    done: list[str] = []
    sub = Subscription.objects.select_related("plan", "scheduled_plan", "user").get(pk=sub_id)
    end = _end(sub)
    if end is None:
        return done
    target = sub.scheduled_plan or sub.plan
    site = pay.site_name()

    # Not renewing: the plan simply ends.
    if not sub.auto_renew or target.is_free:
        if now >= end:
            _expire(sub, f"Your {sub.plan.name} plan has ended. You're on the free plan now.")
            done.append("ended")
        return done

    grace_days = config.get_int("payments.grace_days", 3)
    grace_end = sub.grace_until or end + dt.timedelta(days=grace_days)
    if now >= end and sub.status != S.GRACE:
        with transaction.atomic():
            locked = Subscription.objects.select_for_update().get(pk=sub.pk)
            before = plan_service._snapshot(locked)
            locked.status = S.GRACE
            locked.grace_until = grace_end
            locked.save(update_fields=["status", "grace_until", "updated_at"])
            plan_service.audit(locked, "grace", before)
        sub.refresh_from_db()
        done.append("grace")
    if now >= grace_end:
        _expire(
            sub,
            f"We couldn't take payment for {sub.plan.name}, so you're on the free plan now. "
            "You can upgrade again anytime.",
            sms=f"{site}: we couldn't take payment for {sub.plan.name}, so your account moved "
            "to the free plan. Upgrade anytime in Account.",
        )
        done.append("ended")
        return done

    # One request at a time: wait for the pending one (webhook / reconcile settles it).
    if Payment.objects.filter(
        subscription=sub,
        status__in=[Payment.Status.PENDING, Payment.Status.CREATED],
        purpose__in=[Payment.Purpose.RENEWAL, Payment.Purpose.TRIAL_CONVERSION],
    ).exists():
        return done

    trial = sub.status == S.TRIALING or (sub.trial_end and end == sub.trial_end)
    lead = 0 if trial else config.get_int("payments.renewal_lead_hours", 24)
    due = end - dt.timedelta(hours=lead)
    schedule = sorted(config.get_json("payments.retry_schedule_hours") or [0, 24, 72])
    attempt = sub.retry_count
    if attempt >= len(schedule) or now < due + dt.timedelta(hours=schedule[attempt]):
        return done
    phone = sub.payment_phone or (sub.user.phone if sub.user.phone_verified else "")
    if not phone:
        return done
    if attempt == 0 and sub.reminder_sent_for != end:
        verb = "Your free trial ends" if trial else f"Your {target.name} plan renews"
        pay.send_sms(
            phone,
            f"{site}: {verb} on {pay.local_date(end)}. We're sending a payment request for "
            f"TSh {target.price_tzs:,} to {masked(phone)} — enter your PIN to approve.",
        )
        Subscription.objects.filter(pk=sub.pk).update(reminder_sent_for=end)
        done.append("reminded")
    try:
        pay.begin_payment(
            sub.user,
            target,
            purpose=Payment.Purpose.TRIAL_CONVERSION if trial else Payment.Purpose.RENEWAL,
            phone=phone,
            attempt=attempt + 1,
        )
    except pay.PaymentError as exc:
        log.warning("renewal request for %s failed: %s", sub.pk, exc.code)
    nxt = due + dt.timedelta(hours=schedule[attempt + 1]) if attempt + 1 < len(schedule) else None
    Subscription.objects.filter(pk=sub.pk).update(retry_count=attempt + 1, next_retry_at=nxt)
    done.append("charged")
    return done


def _expire(sub: Subscription, notice: str, sms: str | None = None) -> None:
    """Move to the free plan (status expired) with an in-app notice (and an SMS)."""
    plan_name = sub.plan.name
    sub = plan_service.set_free(sub, reason=f"{plan_name} ended")
    with transaction.atomic():
        locked = Subscription.objects.select_for_update().get(pk=sub.pk)
        locked.status = S.EXPIRED
        pay.set_notice(locked, notice)
        locked.save(update_fields=["status", "notice", "notice_at", "updated_at"])
    if sms:
        pay.send_sms(sub.payment_phone or "", sms)
