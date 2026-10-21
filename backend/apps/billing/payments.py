"""Mobile-money payments and the subscription changes they make.

Every status change — webhook, reconcile poll or Studio's test simulator — goes through
`settle()`, under a row lock, so a payment is applied exactly once however many times Snippe
retries its webhook. Amounts always come from the server-side plan (× the configured multiplier),
never from the client.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import logging
import time

from django.db import transaction
from django.utils import timezone

from apps.accounts import phone as phones
from apps.core.config import config

from . import plans as plan_service
from . import snippe
from .models import Payment, PaymentEvent, Plan, Subscription
from .trials import claim_trial

log = logging.getLogger(__name__)
S = Subscription.Status
P = Payment.Status
WEBHOOK_PATH = "/api/v1/payments/webhook/snippe"
SIGNATURE_MAX_AGE = 300


class PaymentError(Exception):
    def __init__(self, message: str, code: str = "payment_failed", status: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status


# -- helpers ------------------------------------------------------------------------------
def local_date(value: dt.datetime) -> str:
    from .usage import tz

    local = value.astimezone(tz())
    return f"{local.day} {local:%b}"


def site_name() -> str:
    return config.get_str("branding.site_name", "NETFLY") or "NETFLY"


def webhook_url(request=None) -> str:
    configured = config.get_str("payments.webhook_public_url")
    if configured:
        return configured
    return request.build_absolute_uri(WEBHOOK_PATH) if request is not None else ""


def amount_for(plan: Plan) -> int:
    """What Snippe is asked for: the plan price × payments.amount_multiplier."""
    return int(plan.price_tzs) * max(1, config.get_int("payments.amount_multiplier", 1))


def payment_phone(raw: str | None, user) -> str:
    """A Tanzanian mobile-money number (default: the member's verified phone)."""
    value = raw or (user.phone if user.phone_verified else "") or ""
    try:
        phone = phones.normalize(value)
    except ValueError as exc:
        raise PaymentError(str(exc), "validation_error") from exc
    if not phone.startswith("255"):
        raise PaymentError(
            "Mobile-money payments need a Tanzanian number (M-Pesa, Airtel Money, Mixx by Yas or "
            "Halotel).",
            "validation_error",
        )
    return phone


def send_sms(phone: str, text: str) -> None:
    """Best-effort member SMS (reminders, receipts, notices)."""
    if not phone:
        return
    from apps.messaging import sms
    from apps.messaging.errors import MessagingError

    try:
        sms.send(phone, text)
    except MessagingError as exc:
        log.warning("billing sms not sent: %s", exc.code)


def set_notice(sub: Subscription, text: str) -> None:
    sub.notice = text[:300]
    sub.notice_at = timezone.now()


# -- creating payments ----------------------------------------------------------------------
def begin_payment(
    user,
    plan: Plan,
    *,
    purpose: str,
    phone: str,
    request=None,
    attempt: int = 1,
) -> Payment:
    """Ask Snippe to push a payment request to `phone`. Returns the (pending) Payment."""
    if plan.is_free or not plan.price_tzs:
        raise PaymentError("The free plan doesn't need a payment.", "not_applicable", 409)
    sub = plan_service.ensure_subscription(user)
    payment = Payment.objects.create(
        idempotency_key=snippe.new_idempotency_key(),
        user=user,
        subscription=sub,
        plan=plan,
        purpose=purpose,
        amount=plan.price_tzs,
        currency=config.get_str("payments.currency", "TZS"),
        phone=phone,
        network=phones.network(phone) or "",
        attempt=attempt,
    )
    first, _, last = (user.full_name or user.username).partition(" ")
    try:
        result = snippe.create_payment(
            amount=amount_for(plan),
            phone=phone,
            customer={
                "firstname": first or user.username,
                "lastname": last or first or user.username,
                "email": user.email if user.email_verified else "",
            },
            metadata={
                "user_id": user.pk,
                "subscription_id": sub.pk,
                "plan": plan.slug,
                "purpose": purpose,
                "attempt": attempt,
                "payment_id": str(payment.public_id),
            },
            idempotency_key=payment.idempotency_key,
            webhook_url=webhook_url(request),
        )
    except snippe.SnippeError as exc:
        payment.status = P.FAILED
        payment.failure_reason = exc.message
        payment.save(update_fields=["status", "failure_reason", "updated_at"])
        raise PaymentError(
            exc.message if exc.code != "not_configured" else "Payments aren't available right now.",
            exc.code,
            502,
        ) from exc
    payment.reference = result.reference
    payment.status = result.status if result.status in P.values else P.PENDING
    payment.raw = result.raw
    payment.expires_at = _parse_time(result.expires_at) or timezone.now() + dt.timedelta(hours=4)
    payment.save(update_fields=["reference", "status", "raw", "expires_at", "updated_at"])
    if payment.status != P.PENDING:
        settle(payment.pk, payment.status, result.raw)
    Subscription.objects.filter(pk=sub.pk).update(payment_phone=phone, provider="snippe")
    return payment


def _parse_time(value) -> dt.datetime | None:
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.UTC)


def purpose_for(sub: Subscription, plan: Plan) -> str:
    paid_now = not sub.plan.is_free and sub.status in (S.ACTIVE, S.PAST_DUE, S.GRACE, S.CANCELED)
    return Payment.Purpose.UPGRADE if paid_now else Payment.Purpose.SIGNUP


# -- trials -------------------------------------------------------------------------------
@transaction.atomic
def start_trial(user, plan: Plan, *, phone: str, ip=None) -> Subscription:
    """Free trial: the plan's limits right away, no charge; Snippe asks for payment at the end."""
    sub = Subscription.objects.select_for_update().get(pk=plan_service.ensure_subscription(user).pk)
    before = plan_service._snapshot(sub)
    now = timezone.now()
    end = now + dt.timedelta(days=config.get_int("payments.trial_days", 7))
    sub.plan = plan
    sub.status = S.TRIALING
    sub.trial_start, sub.trial_end = now, end
    sub.current_period_start, sub.current_period_end = now, end
    sub.auto_renew = True
    sub.cancel_at_period_end = False
    sub.scheduled_plan = None
    sub.payment_phone = phone
    sub.provider = "snippe"
    sub.retry_count = 0
    sub.next_retry_at = None
    sub.grace_until = None
    sub.reminder_sent_for = None
    sub.save()
    claim_trial(user, plan)
    plan_service.audit(sub, "trial_started", before, actor=user, ip=ip)
    return sub


# -- settling ------------------------------------------------------------------------------
def settle(payment_pk: int, status: str, data: dict | None = None, *, reason: str = "") -> Payment:
    """Move a payment to `status` (idempotent) and make the subscription change it implies."""
    with transaction.atomic():
        payment = (
            Payment.objects.select_for_update()
            .select_related("plan", "user", "subscription")
            .get(pk=payment_pk)
        )
        # A completed payment is final; repeated or late events change nothing.
        if payment.status == P.COMPLETED or (payment.is_final and payment.status == status):
            return payment
        if status not in P.values:
            return payment
        payment.status = status
        if data:
            payment.raw = data
        if status == P.COMPLETED:
            payment.completed_at = timezone.now()
        elif status != P.PENDING:
            payment.failure_reason = (reason or _failure_text(status, data))[:300]
        payment.save()
        if status == P.COMPLETED:
            _apply(payment)
        elif status in (P.FAILED, P.VOIDED, P.EXPIRED):
            _failed(payment)
    if status == P.COMPLETED and payment.applied_at:
        sub = Subscription.objects.get(pk=payment.subscription_id)
        send_sms(
            payment.phone,
            f"{site_name()}: we received TSh {payment.amount:,} for {payment.plan.name}. "
            f"Next payment: {local_date(sub.current_period_end)}. Thank you!",
        )
    return payment


def _failure_text(status: str, data: dict | None) -> str:
    detail = (data or {}).get("failure_reason")
    if isinstance(detail, str) and detail:
        return detail
    return {
        P.EXPIRED: "The request expired before it was approved.",
        P.VOIDED: "The request was cancelled.",
    }.get(status, "The payment wasn't approved.")


def _apply(payment: Payment) -> None:
    """The subscription change for a completed payment (exactly once, via applied_at)."""
    if payment.applied_at:
        return
    sub = (
        Subscription.objects.select_for_update()
        .select_related("plan")
        .get(pk=payment.subscription_id)
    )
    before = plan_service._snapshot(sub)
    now = timezone.now()
    plan = payment.plan
    renewing = payment.purpose in (Payment.Purpose.RENEWAL, Payment.Purpose.TRIAL_CONVERSION)
    previous_end = sub.trial_end if sub.status == S.TRIALING else sub.current_period_end
    if renewing and previous_end and sub.status != S.EXPIRED:
        # No drift: the new period follows the previous one, whenever the money arrived.
        start = previous_end
    else:
        start = now  # a new plan (or an upgrade) starts on payment
    sub.plan = plan
    sub.status = S.ACTIVE
    sub.current_period_start = start
    sub.current_period_end = start + dt.timedelta(days=plan.period_days)
    sub.auto_renew = True
    sub.cancel_at_period_end = False
    sub.scheduled_plan = None
    sub.retry_count = 0
    sub.next_retry_at = None
    sub.grace_until = None
    sub.reminder_sent_for = None
    sub.payment_phone = payment.phone
    sub.provider = "snippe"
    sub.save()
    payment.applied_at = now
    payment.save(update_fields=["applied_at"])
    plan_service.audit(sub, f"paid_{payment.purpose}", before, note=f"payment {payment.reference}")


def _failed(payment: Payment) -> None:
    """A renewal that didn't go through: past due (the renewal job retries, then grace)."""
    if payment.purpose not in (Payment.Purpose.RENEWAL, Payment.Purpose.TRIAL_CONVERSION):
        return  # a signup / upgrade simply didn't happen; the member keeps what they had
    sub = Subscription.objects.select_for_update().get(pk=payment.subscription_id)
    if sub.status in (S.ACTIVE, S.TRIALING):
        before = plan_service._snapshot(sub)
        sub.status = S.PAST_DUE
        sub.save(update_fields=["status", "updated_at"])
        plan_service.audit(sub, "past_due", before, note=payment.failure_reason)


# -- webhooks -----------------------------------------------------------------------------
def verify_signature(
    secret: str, timestamp: str, raw_body: bytes, signature: str, now: float | None = None
) -> bool:
    """X-Webhook-Signature = hex HMAC-SHA256("{timestamp}.{raw body}") with the whsec_ secret;
    timestamps older than five minutes are rejected (replays)."""
    if not (secret and timestamp and signature):
        return False
    try:
        ts = float(timestamp)
    except ValueError:
        return False
    if ts > 1e12:  # milliseconds
        ts /= 1000
    if abs((now or time.time()) - ts) > SIGNATURE_MAX_AGE:
        return False
    expected = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


EVENT_STATUS = {
    "payment.completed": P.COMPLETED,
    "payment.failed": P.FAILED,
    "payment.voided": P.VOIDED,
    "payment.expired": P.EXPIRED,
}


def process_event(event_pk: int) -> str:
    """Apply one stored webhook event (Celery). Safe to run more than once."""
    event = PaymentEvent.objects.get(pk=event_pk)
    if event.processed_at:
        return "already processed"
    data = event.payload.get("data") if isinstance(event.payload.get("data"), dict) else {}
    status = EVENT_STATUS.get(event.type) or str(data.get("status") or "")
    payment = Payment.objects.filter(reference=event.reference).first()
    if payment is None:
        event.error = "unknown reference"
    elif status not in P.values:
        event.error = f"unhandled event {event.type}"
    else:
        settle(payment.pk, status, data, reason=str(data.get("failure_reason") or ""))
    event.processed_at = timezone.now()
    event.save(update_fields=["processed_at", "error"])
    return event.error or "ok"


# -- reconcile ----------------------------------------------------------------------------
def reconcile(now: dt.datetime | None = None, limit: int = 200) -> int:
    """Poll Snippe for pending payments (a lost webhook), and expire ones past their deadline."""
    now = now or timezone.now()
    changed = 0
    pending = Payment.objects.filter(status__in=[P.PENDING, P.CREATED]).order_by("created_at")
    for payment in pending[:limit]:
        if payment.reference:
            try:
                remote = snippe.get_payment(payment.reference)
            except snippe.SnippeError as exc:
                log.warning("reconcile %s: %s", payment.pk, exc.code)
                continue
            if remote and remote.status != payment.status:
                settle(payment.pk, remote.status, remote.raw)
                changed += 1
                continue
        deadline = payment.expires_at or payment.created_at + dt.timedelta(hours=4)
        if now >= deadline:
            settle(payment.pk, P.EXPIRED)
            changed += 1
    return changed
