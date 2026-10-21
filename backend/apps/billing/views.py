"""Viewer billing API: plans, membership & usage, plan choice, auto-renew, heartbeats."""

from __future__ import annotations

from django.core.cache import cache
from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsViewer
from apps.core.audit import client_ip
from apps.core.config import config
from apps.core.exceptions import APIError
from apps.core.throttling import throttle

from . import plans as plan_service
from . import usage
from .models import Plan, Subscription
from .serializers import (
    AutoRenewSerializer,
    CheckoutSerializer,
    ChoosePlanResultSerializer,
    ChoosePlanSerializer,
    HeartbeatRequestSerializer,
    HeartbeatResponseSerializer,
    MembershipSerializer,
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
