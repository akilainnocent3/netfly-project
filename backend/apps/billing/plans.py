"""Plan lookups and subscription changes (every change is audit-logged)."""

from __future__ import annotations

import datetime as dt

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.core.audit import record

from .models import Plan, Subscription

DEFAULT_PLAN_CACHE = "billing:default-plan"

# Statuses in which the member enjoys their plan's limits.
ENTITLED = {
    Subscription.Status.TRIALING,
    Subscription.Status.ACTIVE,
    Subscription.Status.PAST_DUE,
    Subscription.Status.GRACE,
    Subscription.Status.CANCELED,  # until current_period_end
}


def default_plan() -> Plan:
    pk = cache.get(DEFAULT_PLAN_CACHE)
    plan = Plan.objects.filter(pk=pk, is_default=True).first() if pk else None
    if plan is None:
        plan = Plan.objects.filter(is_default=True).first()
        if plan is None:
            # Never leave anyone without a plan: recreate a minimal free default.
            plan, _ = Plan.objects.get_or_create(
                slug="bure",
                defaults={
                    "name": "Bure",
                    "is_free": True,
                    "is_default": True,
                    "daily_limit_minutes": 60,
                    "weekly_limit_minutes": 240,
                    "monthly_limit_minutes": 720,
                },
            )
        cache.set(DEFAULT_PLAN_CACHE, plan.pk, 300)
    return plan


def forget_default_plan() -> None:
    cache.delete(DEFAULT_PLAN_CACHE)


def ensure_subscription(user) -> Subscription:
    """Every account has exactly one subscription; a missing one means the free default."""
    sub = Subscription.objects.select_related("plan", "scheduled_plan").filter(user=user).first()
    if sub is None:
        sub, _ = Subscription.objects.get_or_create(
            user=user, defaults={"plan": default_plan(), "status": Subscription.Status.FREE}
        )
        sub = Subscription.objects.select_related("plan", "scheduled_plan").get(pk=sub.pk)
    return sub


def effective_plan(sub: Subscription, now: dt.datetime | None = None) -> Plan:
    """The plan whose limits apply right now (read live, never copied onto the user)."""
    now = now or timezone.now()
    if sub.plan.is_free:
        return sub.plan
    if sub.status in ENTITLED:
        if sub.status == Subscription.Status.CANCELED and (
            not sub.current_period_end or sub.current_period_end <= now
        ):
            return default_plan()
        return sub.plan
    return default_plan()


def _snapshot(sub: Subscription) -> dict:
    return {
        "plan": sub.plan.slug,
        "status": sub.status,
        "current_period_end": (
            sub.current_period_end.isoformat() if sub.current_period_end else None
        ),
        "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
        "auto_renew": sub.auto_renew,
        "scheduled_plan": sub.scheduled_plan.slug if sub.scheduled_plan else None,
    }


def audit(sub: Subscription, action: str, before: dict, *, actor=None, ip=None, note="") -> None:
    after = _snapshot(sub)
    changes = {k: {"old": before.get(k), "new": v} for k, v in after.items() if before.get(k) != v}
    if note:
        changes["note"] = note
    record(actor, f"subscription.{action}", sub, changes=changes, ip=ip)


@transaction.atomic
def set_free(sub: Subscription, *, actor=None, ip=None, reason: str = "") -> Subscription:
    """Move to the free default plan now (signup choice, expiry, staff action)."""
    sub = Subscription.objects.select_for_update().select_related("plan").get(pk=sub.pk)
    before = _snapshot(sub)
    sub.plan = default_plan()
    sub.status = Subscription.Status.FREE
    sub.current_period_start = None
    sub.current_period_end = None
    sub.trial_start = None
    sub.trial_end = None
    sub.auto_renew = True
    sub.cancel_at_period_end = False
    sub.scheduled_plan = None
    sub.retry_count = 0
    sub.next_retry_at = None
    sub.grace_until = None
    sub.save()
    audit(sub, "free", before, actor=actor, ip=ip, note=reason)
    return sub


@transaction.atomic
def set_auto_renew(sub: Subscription, on: bool, *, actor=None, ip=None) -> Subscription:
    """Cancel = auto-renew off: the plan stays until the period ends, then it's the free plan."""
    sub = Subscription.objects.select_for_update().select_related("plan").get(pk=sub.pk)
    before = _snapshot(sub)
    sub.auto_renew = on
    sub.cancel_at_period_end = not on
    if not on and sub.status == Subscription.Status.ACTIVE:
        sub.status = Subscription.Status.CANCELED
    elif on and sub.status == Subscription.Status.CANCELED:
        sub.status = Subscription.Status.ACTIVE
    sub.save()
    audit(sub, "auto_renew_on" if on else "auto_renew_off", before, actor=actor, ip=ip)
    return sub


@transaction.atomic
def staff_change_plan(
    sub: Subscription, plan: Plan, *, days: int | None, actor, ip=None
) -> Subscription:
    """Studio: put a member on any plan right now (comped), optionally for N days."""
    sub = Subscription.objects.select_for_update().select_related("plan").get(pk=sub.pk)
    before = _snapshot(sub)
    now = timezone.now()
    sub.plan = plan
    sub.scheduled_plan = None
    if plan.is_free:
        sub.status = Subscription.Status.FREE
        sub.current_period_start = sub.current_period_end = None
    else:
        sub.status = Subscription.Status.ACTIVE
        sub.current_period_start = now
        sub.current_period_end = now + dt.timedelta(days=days or plan.period_days)
        sub.retry_count = 0
        sub.next_retry_at = None
        sub.grace_until = None
    sub.save()
    audit(sub, "staff_change_plan", before, actor=actor, ip=ip)
    return sub


@transaction.atomic
def extend(sub: Subscription, days: int, *, actor, ip=None) -> Subscription:
    """Studio: grant / extend a paid period (or a trial) by N days."""
    sub = Subscription.objects.select_for_update().select_related("plan").get(pk=sub.pk)
    before = _snapshot(sub)
    now = timezone.now()
    delta = dt.timedelta(days=days)
    if sub.status == Subscription.Status.TRIALING and sub.trial_end:
        sub.trial_end = max(sub.trial_end, now) + delta
        sub.current_period_end = sub.trial_end
    elif sub.current_period_end:
        sub.current_period_end = max(sub.current_period_end, now) + delta
        if sub.status in (
            Subscription.Status.PAST_DUE,
            Subscription.Status.GRACE,
            Subscription.Status.EXPIRED,
        ):
            sub.status = Subscription.Status.ACTIVE
            sub.grace_until = None
            sub.next_retry_at = None
            sub.retry_count = 0
    else:
        raise ValueError("Put the member on a paid plan first.")
    sub.save()
    audit(sub, "extend", before, actor=actor, ip=ip, note=f"+{days} days")
    return sub
