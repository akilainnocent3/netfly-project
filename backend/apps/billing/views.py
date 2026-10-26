"""Viewer billing API: plans, membership & usage, plan choice, auto-renew, heartbeats."""

from __future__ import annotations

import datetime as dt

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsViewer
from apps.core.audit import client_ip
from apps.core.config import config
from apps.core.exceptions import APIError
from apps.core.throttling import throttle

from . import payments as pay
from . import plans as plan_service
from . import usage
from .models import Payment, Plan, Subscription
from .serializers import (
    AutoRenewSerializer,
    CheckoutSerializer,
    CheckoutStartResultSerializer,
    CheckoutStartSerializer,
    ChoosePlanResultSerializer,
    ChoosePlanSerializer,
    HeartbeatRequestSerializer,
    HeartbeatResponseSerializer,
    MembershipSerializer,
    PaymentSerializer,
    PhoneOverrideSerializer,
    PlanSerializer,
    PlansResponseSerializer,
    SubscriptionSerializer,
    UsageSnapshotSerializer,
)

PLANS_CACHE = "billing:plans"


def active_plans() -> list[Plan]:
    return list(Plan.objects.filter(is_active=True).order_by("order", "price_tzs", "id"))


def forget_plans() -> None:
    cache.delete(PLANS_CACHE)
    plan_service.forget_default_plan()


def trial_settings() -> tuple[bool, int]:
    return config.get_bool("payments.trial_enabled", True), config.get_int("payments.trial_days", 7)


def trial_eligible(user, plan: Plan | None = None) -> bool:
    """One free trial per member (and, once verified, per phone and email — see verification)."""
    enabled, _ = trial_settings()
    if not enabled or (plan is not None and not plan.trial_eligible):
        return False
    sub = plan_service.ensure_subscription(user)
    if sub.trial_start is not None:
        return False
    from .trials import trial_already_used

    return not trial_already_used(user)


def steps_for(user, plan: Plan, *, trial: bool) -> list[str]:
    """What a member still has to do before a paid plan or a trial starts."""
    needs_email = config.get_bool("payments.trial_requires_email", True) if trial else True
    needs_phone = config.get_bool("payments.trial_requires_phone", True) if trial else True
    steps = []
    if needs_email and not user.email_verified:
        steps.append("email")
    if needs_phone and not user.phone_verified:
        steps.append("phone")
    steps.append("trial" if trial else "payment")
    return steps


class PlansView(APIView):
    """Public plan list for the plan picker (cached; Studio edits clear it)."""

    authentication_classes: list = []

    @extend_schema(responses=PlansResponseSerializer, operation_id="billing_plans")
    def get(self, request):
        data = cache.get(PLANS_CACHE)
        if data is None:
            enabled, days = trial_settings()
            data = {
                "plans": PlanSerializer(active_plans(), many=True).data,
                "trial_enabled": enabled,
                "trial_days": days,
                "currency": config.get_str("payments.currency", "TZS"),
            }
            cache.set(PLANS_CACHE, data, 60)
        response = Response(data)
        response["Cache-Control"] = "public, max-age=30"
        return response


class MembershipView(APIView):
    permission_classes = [IsViewer]

    @extend_schema(responses=MembershipSerializer, operation_id="billing_membership")
    def get(self, request):
        sub = plan_service.ensure_subscription(request.user)
        enabled, days = trial_settings()
        response = Response(
            {
                "subscription": SubscriptionSerializer(sub).data,
                "usage": usage.snapshot(request.user, sub=sub),
                "trial": {
                    "enabled": enabled,
                    "days": days,
                    "eligible": trial_eligible(request.user),
                },
            }
        )
        response["Cache-Control"] = "private, no-store"
        return response


class UsageView(APIView):
    """Lightweight usage snapshot (profile menu, Play button, re-sync every 30 s)."""

    permission_classes = [IsViewer]

    @extend_schema(responses=UsageSnapshotSerializer, operation_id="billing_usage")
    def get(self, request):
        response = Response(usage.snapshot(request.user))
        response["Cache-Control"] = "private, no-store"
        return response


class ChoosePlanView(APIView):
    """Free applies at once. Paid plans / trials return the steps still needed (verify, pay);
    a downgrade from a paid plan waits for the end of the paid period."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_engagement", per_user=True)]

    @extend_schema(
        request=ChoosePlanSerializer,
        responses=ChoosePlanResultSerializer,
        operation_id="billing_choose_plan",
    )
    def post(self, request):
        data = ChoosePlanSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        plan = Plan.objects.filter(slug=data.validated_data["plan"], is_active=True).first()
        if plan is None:
            raise APIError("That plan isn't available.", "not_found", 404)
        trial = bool(data.validated_data.get("trial"))
        user = request.user
        sub = plan_service.ensure_subscription(user)
        ip = client_ip(request)
        S = Subscription.Status
        paid_now = sub.status in (S.ACTIVE, S.TRIALING, S.PAST_DUE, S.GRACE, S.CANCELED) and (
            not sub.plan.is_free
        )
        if plan.is_free:
            if paid_now and sub.current_period_end:
                with transaction.atomic():
                    sub = Subscription.objects.select_for_update().get(pk=sub.pk)
                    before = plan_service._snapshot(sub)
                    sub.scheduled_plan = plan
                    sub.auto_renew = False
                    sub.cancel_at_period_end = True
                    if sub.status == S.ACTIVE:
                        sub.status = S.CANCELED
                    sub.save()
                    plan_service.audit(sub, "downgrade_scheduled", before, actor=user, ip=ip)
                status = "scheduled"
            else:
                sub = plan_service.set_free(sub, actor=user, ip=ip, reason="member chose free")
                status = "applied"
            return Response(
                {
                    "status": status,
                    "steps": [],
                    "subscription": SubscriptionSerializer(
                        plan_service.ensure_subscription(user)
                    ).data,
                }
            )
        if trial and not trial_eligible(user, plan):
            raise APIError(
                "A free trial isn't available on this account.", "trial_unavailable", 409
            )
        if paid_now and sub.status != S.TRIALING and plan.price_tzs < sub.plan.price_tzs:
            # Downgrade between paid plans: takes effect when the paid period ends.
            with transaction.atomic():
                sub = Subscription.objects.select_for_update().get(pk=sub.pk)
                before = plan_service._snapshot(sub)
                sub.scheduled_plan = plan
                sub.save()
                plan_service.audit(sub, "downgrade_scheduled", before, actor=user, ip=ip)
            return Response(
                {
                    "status": "scheduled",
                    "steps": [],
                    "subscription": SubscriptionSerializer(
                        plan_service.ensure_subscription(user)
                    ).data,
                }
            )
        return Response(
            {
                "status": "needs",
                "steps": steps_for(user, plan, trial=trial),
                "subscription": SubscriptionSerializer(sub).data,
            }
        )


class CheckoutView(APIView):
    """What's left before a paid plan or a trial starts (verify email → phone → pay / trial)."""

    permission_classes = [IsViewer]

    @extend_schema(
        parameters=[OpenApiParameter("plan", str), OpenApiParameter("trial", bool)],
        responses=CheckoutSerializer,
        operation_id="billing_checkout",
    )
    def get(self, request):
        slug = request.query_params.get("plan", "")
        plan = Plan.objects.filter(slug=slug, is_active=True, is_free=False).first()
        if plan is None:
            raise APIError("Choose a paid plan first.", "not_found", 404)
        trial = request.query_params.get("trial") in ("1", "true")
        if trial and not trial_eligible(request.user, plan):
            raise APIError(
                "A free trial isn't available on this account.", "trial_unavailable", 409
            )
        from apps.accounts.phone import network

        user = request.user
        sub = plan_service.ensure_subscription(user)
        phone = sub.payment_phone or (user.phone if user.phone_verified else "") or ""
        _, days = trial_settings()
        response = Response(
            {
                "plan": PlanSerializer(plan).data,
                "trial": trial,
                "trial_days": days,
                "steps": steps_for(user, plan, trial=trial),
                "amount_tzs": plan.price_tzs,
                "payment_phone": phone,
                "payment_network": network(phone) if phone else None,
            }
        )
        response["Cache-Control"] = "private, no-store"
        return response


class AutoRenewView(APIView):
    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_engagement", per_user=True)]

    @extend_schema(
        request=AutoRenewSerializer,
        responses=SubscriptionSerializer,
        operation_id="billing_auto_renew",
    )
    def post(self, request):
        data = AutoRenewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        sub = plan_service.ensure_subscription(request.user)
        if sub.plan.is_free:
            raise APIError("The free plan doesn't renew.", "not_applicable", 409)
        sub = plan_service.set_auto_renew(
            sub, data.validated_data["on"], actor=request.user, ip=client_ip(request)
        )
        return Response(SubscriptionSerializer(sub).data)


class HeartbeatView(APIView):
    """The player reports viewing time; the server decides what counts (see usage.heartbeat)."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_events", per_user=True)]

    @extend_schema(
        request=HeartbeatRequestSerializer,
        responses=HeartbeatResponseSerializer,
        operation_id="playback_heartbeat",
    )
    def post(self, request):
        data = HeartbeatRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            snap = usage.heartbeat(
                request.user,
                data.validated_data["session_id"],
                watched=data.validated_data["watched"],
                playing=data.validated_data["playing"],
            )
        except usage.HeartbeatError as exc:
            raise APIError(exc.message, exc.code, exc.status) from exc
        response = Response(snap)
        response["Cache-Control"] = "private, no-store"
        return response


def _payment_error(exc: pay.PaymentError):
    raise APIError(exc.message, exc.code, exc.status) from exc


def _no_store(response: Response) -> Response:
    response["Cache-Control"] = "private, no-store"
    return response


class CheckoutStartView(APIView):
    """Start the free trial (no charge) or push the plan's payment request to the phone.
    The amount comes from the plan on the server; a second tap returns the pending request."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_payment", per_user=True)]

    @extend_schema(
        request=CheckoutStartSerializer,
        responses=CheckoutStartResultSerializer,
        operation_id="billing_checkout_start",
    )
    def post(self, request):
        data = CheckoutStartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = request.user
        plan = Plan.objects.filter(
            slug=data.validated_data["plan"], is_active=True, is_free=False
        ).first()
        if plan is None:
            raise APIError("Choose a paid plan first.", "not_found", 404)
        trial = bool(data.validated_data.get("trial"))
        if trial and not trial_eligible(user, plan):
            raise APIError(
                "A free trial isn't available on this account.", "trial_unavailable", 409
            )
        left = [s for s in steps_for(user, plan, trial=trial) if s in ("email", "phone")]
        if left:
            raise APIError(
                "Please verify your email and phone number first.",
                "verification_required",
                409,
                extra={"steps": left},
            )
        try:
            phone = pay.payment_phone(data.validated_data.get("phone"), user)
            if trial:
                sub = pay.start_trial(user, plan, phone=phone, ip=client_ip(request))
                return _no_store(
                    Response(
                        {
                            "kind": "trial",
                            "payment": None,
                            "subscription": SubscriptionSerializer(sub).data,
                        },
                        status=201,
                    )
                )
            sub = plan_service.ensure_subscription(user)
            if sub.plan_id == plan.pk and sub.status in (Subscription.Status.ACTIVE,):
                raise APIError("You're already on this plan.", "already_subscribed", 409)
            pending = Payment.objects.filter(
                user=user,
                plan=plan,
                status=Payment.Status.PENDING,
                purpose__in=[Payment.Purpose.SIGNUP, Payment.Purpose.UPGRADE],
                phone=phone,
                expires_at__gt=timezone.now(),
                created_at__gt=timezone.now()
                - dt.timedelta(seconds=config.get_int("payments.approve_timeout_seconds", 120)),
            ).first()
            payment = pending or pay.begin_payment(
                user, plan, purpose=pay.purpose_for(sub, plan), phone=phone, request=request
            )
        except pay.PaymentError as exc:
            _payment_error(exc)
        return _no_store(
            Response(
                {
                    "kind": "payment",
                    "payment": PaymentSerializer(payment).data,
                    "subscription": SubscriptionSerializer(
                        plan_service.ensure_subscription(user)
                    ).data,
                },
                status=201,
            )
        )


def _own_payment(request, payment_id) -> Payment:
    payment = (
        Payment.objects.select_related("plan")
        .filter(public_id=payment_id, user=request.user)
        .first()
    )
    if payment is None:
        raise APIError("Payment not found.", "not_found", 404)
    return payment


class PaymentStatusView(APIView):
    """Polled every few seconds by "Check your phone". Reads our DB, kept fresh by the webhook
    and the reconcile job; while the payment is still pending it also asks Snippe (at most
    every few seconds per payment), so a late webhook doesn't keep the viewer waiting for the
    next reconcile run."""

    permission_classes = [IsViewer]

    @extend_schema(responses=PaymentSerializer, operation_id="billing_payment")
    def get(self, request, payment_id):
        payment = _own_payment(request, payment_id)
        if (
            payment.reference
            and payment.status in (Payment.Status.PENDING, Payment.Status.CREATED)
            and cache.add(f"billing:payment-check:{payment.pk}", 1, timeout=4)
        ):
            payment = pay.refresh(payment)
        return _no_store(Response(PaymentSerializer(payment).data))


class PaymentResendView(APIView):
    """A new request (new idempotency key) for the same plan, optionally to another number."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_payment", per_user=True)]

    @extend_schema(
        request=PhoneOverrideSerializer,
        responses=PaymentSerializer,
        operation_id="billing_payment_resend",
    )
    def post(self, request, payment_id):
        old = _own_payment(request, payment_id)
        if old.status == Payment.Status.COMPLETED:
            raise APIError("This payment is already complete.", "conflict", 409)
        data = PhoneOverrideSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            phone = pay.payment_phone(data.validated_data.get("phone") or old.phone, request.user)
            payment = pay.begin_payment(
                request.user,
                old.plan,
                purpose=old.purpose,
                phone=phone,
                request=request,
                attempt=old.attempt + 1,
            )
        except pay.PaymentError as exc:
            _payment_error(exc)
        return _no_store(Response(PaymentSerializer(payment).data, status=201))


class PaymentsView(APIView):
    """Payment history (Account → Membership)."""

    permission_classes = [IsViewer]

    @extend_schema(responses=PaymentSerializer(many=True), operation_id="billing_payments")
    def get(self, request):
        rows = Payment.objects.filter(user=request.user).select_related("plan")[:50]
        return _no_store(Response(PaymentSerializer(rows, many=True).data))


class RenewNowView(APIView):
    """Account → Renew now: pay the next period at once (past due, grace, or early)."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_payment", per_user=True)]

    @extend_schema(
        request=PhoneOverrideSerializer,
        responses=PaymentSerializer,
        operation_id="billing_renew_now",
    )
    def post(self, request):
        S = Subscription.Status
        sub = plan_service.ensure_subscription(request.user)
        if sub.plan.is_free or sub.status not in (S.ACTIVE, S.TRIALING, S.PAST_DUE, S.GRACE):
            raise APIError(
                "There's nothing to renew. Choose a plan instead.", "not_applicable", 409
            )
        data = PhoneOverrideSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        target = (
            sub.scheduled_plan
            if sub.scheduled_plan and not sub.scheduled_plan.is_free
            else sub.plan
        )
        try:
            phone = pay.payment_phone(
                data.validated_data.get("phone") or sub.payment_phone, request.user
            )
            payment = pay.begin_payment(
                request.user,
                target,
                purpose=(
                    Payment.Purpose.TRIAL_CONVERSION
                    if sub.status == S.TRIALING
                    else Payment.Purpose.RENEWAL
                ),
                phone=phone,
                request=request,
            )
        except pay.PaymentError as exc:
            _payment_error(exc)
        return _no_store(Response(PaymentSerializer(payment).data, status=201))


class NoticeDismissView(APIView):
    permission_classes = [IsViewer]

    @extend_schema(request=None, responses={204: None}, operation_id="billing_notice_dismiss")
    def post(self, request):
        Subscription.objects.filter(user=request.user).update(notice="", notice_at=None)
        return Response(status=204)
