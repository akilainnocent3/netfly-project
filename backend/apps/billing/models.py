"""Plans, subscriptions and viewing-time metering.

Plans differ ONLY in usage limits (minutes per day / week / month). Every plan streams at the
same, highest quality with the same features; nothing here may cap quality, devices or
downloads. Limits are always read live from the member's plan (never copied onto the user),
so editing a plan in Studio applies to everyone on it at once.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Plan(models.Model):
    name = models.CharField(max_length=60)
    slug = models.SlugField(max_length=60, unique=True)
    tagline = models.CharField(max_length=160, blank=True)
    price_tzs = models.PositiveIntegerField(default=0)
    period_days = models.PositiveSmallIntegerField(default=30)
    # Null = no limit for that window (every seeded plan has all three).
    daily_limit_minutes = models.PositiveIntegerField(null=True, blank=True)
    weekly_limit_minutes = models.PositiveIntegerField(null=True, blank=True)
    monthly_limit_minutes = models.PositiveIntegerField(null=True, blank=True)
    trial_eligible = models.BooleanField(default=False)
    is_free = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    highlight_label = models.CharField(max_length=40, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    feature_bullets = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "price_tzs", "id"]
        constraints = [
            # Exactly one default plan, and it is free (the API guards "exactly one" too).
            models.UniqueConstraint(
                fields=["is_default"], condition=Q(is_default=True), name="plan_single_default"
            ),
            models.CheckConstraint(
                condition=Q(is_default=False) | Q(is_free=True, is_active=True),
                name="plan_default_is_free_and_active",
            ),
            models.CheckConstraint(
                condition=Q(is_free=False) | Q(price_tzs=0), name="plan_free_costs_nothing"
            ),
        ]

    def __str__(self) -> str:
        return self.name

    def limits(self) -> dict[str, int | None]:
        return {
            "day": self.daily_limit_minutes,
            "week": self.weekly_limit_minutes,
            "month": self.monthly_limit_minutes,
        }


class Subscription(models.Model):
    class Status(models.TextChoices):
        FREE = "free"
        TRIALING = "trialing"
        ACTIVE = "active"
        PAST_DUE = "past_due"
        GRACE = "grace"
        CANCELED = "canceled"
        EXPIRED = "expired"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="subscription"
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.FREE)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    trial_start = models.DateTimeField(null=True, blank=True)
    trial_end = models.DateTimeField(null=True, blank=True)
    auto_renew = models.BooleanField(default=True)
    cancel_at_period_end = models.BooleanField(default=False)
    # A downgrade waits for the end of the paid period.
    scheduled_plan = models.ForeignKey(
        Plan, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    payment_phone = models.CharField(max_length=15, blank=True)
    provider = models.CharField(max_length=20, blank=True)
    # Renewal / retry bookkeeping (Phase 6 state machine).
    retry_count = models.PositiveSmallIntegerField(default=0)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    grace_until = models.DateTimeField(null=True, blank=True)
    reminder_sent_for = models.DateTimeField(null=True, blank=True)
    # A one-time in-app notice ("Your Pendwa plan ended…"), shown until dismissed.
    notice = models.CharField(max_length=300, blank=True)
    notice_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "current_period_end"]),
            models.Index(fields=["status", "trial_end"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.plan_id}:{self.status}"


class UsageLedger(models.Model):
    """Credited viewing time: one row per playback session per local day (a binge across
    midnight lands in both days). Redis holds the fast counters; this is the source of truth."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="usage_rows"
    )
    session_id = models.CharField(max_length=40)
    title = models.ForeignKey(
        "catalog.Title", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    episode = models.ForeignKey(
        "catalog.Episode", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    started_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)
    credited_seconds = models.FloatField(default=0)
    day_key = models.CharField(max_length=16)
    week_key = models.CharField(max_length=16)
    month_key = models.CharField(max_length=16)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session_id", "day_key"], name="usage_session_day")
        ]
        indexes = [
            models.Index(fields=["user", "day_key"]),
            models.Index(fields=["user", "week_key"]),
            models.Index(fields=["user", "month_key"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.day_key}:{self.credited_seconds:.0f}s"


class UsageAdjustment(models.Model):
    """Staff corrections: bonus minutes, or a reset (bonus = what was used). Positive seconds
    raise the allowance of one window bucket only."""

    class Scope(models.TextChoices):
        DAY = "day"
        WEEK = "week"
        MONTH = "month"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="usage_adjustments"
    )
    scope = models.CharField(max_length=5, choices=Scope.choices)
    bucket = models.CharField(max_length=16)
    seconds = models.IntegerField()
    reason = models.CharField(max_length=200, blank=True)
    kind = models.CharField(max_length=10, default="bonus")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user", "scope", "bucket"])]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.scope}:{self.bucket}:{self.seconds:+d}s"


class TrialClaim(models.Model):
    """One free trial per account AND per verified phone AND per verified email (abuse guard).
    Kept even if the account is deleted (user becomes null) so the phone/email stay used."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    phone = models.CharField(max_length=15, blank=True, db_index=True)
    email = models.CharField(max_length=254, blank=True, db_index=True)
    plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"trial:{self.user_id}:{self.plan_id}"


class Payment(models.Model):
    """One mobile-money push (USSD) request. The amount always comes from the server-side plan."""

    class Purpose(models.TextChoices):
        SIGNUP = "signup"
        TRIAL_CONVERSION = "trial_conversion"
        RENEWAL = "renewal"
        UPGRADE = "upgrade"

    class Status(models.TextChoices):
        CREATED = "created"  # before the provider answered
        PENDING = "pending"
        COMPLETED = "completed"
        FAILED = "failed"
        VOIDED = "voided"
        EXPIRED = "expired"

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    reference = models.CharField(max_length=80, unique=True, null=True, blank=True)
    idempotency_key = models.CharField(max_length=30, unique=True)
    provider = models.CharField(max_length=20, default="snippe")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payments"
    )
    subscription = models.ForeignKey(
        Subscription, on_delete=models.PROTECT, related_name="payments"
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="payments")
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    amount = models.PositiveIntegerField()  # TZS
    currency = models.CharField(max_length=3, default="TZS")
    phone = models.CharField(max_length=15)
    network = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CREATED)
    failure_reason = models.CharField(max_length=300, blank=True)
    raw = models.JSONField(default=dict, blank=True)
    attempt = models.PositiveSmallIntegerField(default=1)
    expires_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    # Set once the subscription change for a completed payment has been made (idempotency).
    applied_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["subscription", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.reference or self.public_id}:{self.status}"

    @property
    def is_final(self) -> bool:
        return self.status in FINAL_PAYMENT_STATUSES


FINAL_PAYMENT_STATUSES = {
    Payment.Status.COMPLETED,
    Payment.Status.FAILED,
    Payment.Status.VOIDED,
    Payment.Status.EXPIRED,
}


class PaymentEvent(models.Model):
    """Every webhook delivery, kept for audit (valid or not). Duplicate event ids are ignored."""

    event_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    type = models.CharField(max_length=40, blank=True)
    reference = models.CharField(max_length=80, blank=True, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    signature_valid = models.BooleanField(default=False)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-received_at"]

    def __str__(self) -> str:
        return f"{self.type}:{self.reference}"
