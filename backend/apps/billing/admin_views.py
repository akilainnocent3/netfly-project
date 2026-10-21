"""Studio: plans, subscribers and billing stats. Every write is audit-logged."""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_field,
    inline_serializer,
)
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import StaffPermission
from apps.adminapi.mixins import AdminPagination, AuditedMixin
from apps.core.audit import client_ip, record
from apps.core.exceptions import APIError

from . import plans as plan_service
from . import usage
from .models import Payment, Plan, Subscription, UsageAdjustment
from .serializers import (
    AdminPlanSerializer,
    PaymentSerializer,
    PlanSerializer,
    UsageSnapshotSerializer,
)
from .views import forget_plans

R = User.Role
READ = (R.CONTENT_MANAGER, R.ANALYST)


class PlanViewSet(AuditedMixin, viewsets.ModelViewSet):
    """Plans differ only in limits. Exactly one active, free, default plan always exists."""

    serializer_class = AdminPlanSerializer
    pagination_class = None
    read_roles = READ
    write_roles = ()  # superadmin only
    audit_type = "plan"

    def get_queryset(self):
        return Plan.objects.annotate(
            subscribers=Count("subscriptions", filter=~Q(subscriptions__status="expired"))
        ).order_by("order", "price_tzs", "id")

    @transaction.atomic
    def perform_create(self, serializer):
        self._guard_default(serializer)
        super().perform_create(serializer)
        transaction.on_commit(forget_plans)

    @transaction.atomic
    def perform_update(self, serializer):
        self._guard_default(serializer)
        super().perform_update(serializer)
        transaction.on_commit(forget_plans)

    def _guard_default(self, serializer) -> None:
        data = serializer.validated_data
        instance = serializer.instance
        becoming_default = data.get("is_default") is True
        if becoming_default:
            # Hand the "default" over atomically (the DB allows only one).
            Plan.objects.select_for_update().filter(is_default=True).exclude(
                pk=getattr(instance, "pk", None)
            ).update(is_default=False)
        elif instance is not None and instance.is_default:
            if data.get("is_default") is False:
                raise APIError(
                    "Make another free plan the default first.",
                    "validation_error",
                    fields={"is_default": "There must always be a default free plan."},
                )
            if data.get("is_active") is False or data.get("is_free") is False:
                raise APIError(
                    "The default plan must stay free and active.",
                    "validation_error",
                    fields={"is_active": "The default plan must stay free and active."},
                )

    def perform_destroy(self, instance):
        if instance.is_default:
            raise APIError("The default plan can't be deleted.", "conflict", 409)
        if instance.subscriptions.exists():
            raise APIError(
                "Members are on this plan. Deactivate it instead (they keep it until they change).",
                "conflict",
                409,
            )
        super().perform_destroy(instance)
        transaction.on_commit(forget_plans)

    @extend_schema(
        request=inline_serializer(
            "PlanReorderRequest", {"ids": serializers.ListField(child=serializers.IntegerField())}
        ),
        responses=AdminPlanSerializer(many=True),
        operation_id="admin_plans_reorder",
    )
    @action(detail=False, methods=["post"])
    def reorder(self, request):
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            raise APIError("Send the plan ids in their new order.", "validation_error")
        with transaction.atomic():
            for order, pk in enumerate(ids):
                Plan.objects.filter(pk=pk).update(order=order)
        record(request.user, "plan.reorder", changes={"ids": ids}, ip=client_ip(request))
        forget_plans()
        return Response(AdminPlanSerializer(self.get_queryset(), many=True).data)


class SubscriberSerializer(serializers.ModelSerializer):
    plan = serializers.CharField(source="subscription.plan.name", default=None)
    plan_slug = serializers.CharField(source="subscription.plan.slug", default=None)
    status = serializers.CharField(source="subscription.status", default="free")
    current_period_end = serializers.DateTimeField(
        source="subscription.current_period_end", default=None
    )
    trial_end = serializers.DateTimeField(source="subscription.trial_end", default=None)
    auto_renew = serializers.BooleanField(source="subscription.auto_renew", default=True)
    payment_phone = serializers.CharField(source="subscription.payment_phone", default="")

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "full_name",
            "email",
            "email_verified",
            "phone",
            "phone_verified",
            "is_staff",
            "created_at",
            "plan",
            "plan_slug",
            "status",
            "current_period_end",
            "trial_end",
            "auto_renew",
            "payment_phone",
        ]

    email_verified = serializers.BooleanField(read_only=True)
    phone_verified = serializers.BooleanField(read_only=True)


class SubscriberDetailSerializer(SubscriberSerializer):
    usage = serializers.SerializerMethodField()

    class Meta(SubscriberSerializer.Meta):
        fields = [*SubscriberSerializer.Meta.fields, "usage"]

    @extend_schema_field(UsageSnapshotSerializer)
    def get_usage(self, obj) -> dict:
        return usage.snapshot(obj)


class SubscriberActionSerializer(serializers.Serializer):
    plan = serializers.SlugField(required=False)
    days = serializers.IntegerField(required=False, min_value=1, max_value=3650)
    minutes = serializers.IntegerField(required=False, min_value=1, max_value=60 * 24 * 31)
    scope = serializers.ChoiceField(choices=UsageAdjustment.Scope.choices, required=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200)


class SubscriberViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Members with their plan, status, period and usage; staff actions are audited."""

    permission_classes = [StaffPermission]
    read_roles = READ
    write_roles = ()  # superadmin only
    pagination_class = AdminPagination
    serializer_class = SubscriberSerializer

    def get_serializer_class(self):
        return SubscriberDetailSerializer if self.action == "retrieve" else SubscriberSerializer

    def get_queryset(self):
        qs = User.objects.select_related("subscription__plan").order_by("-created_at")
        q = self.request.query_params.get("q", "").strip()
        if q:
            digits = "".join(c for c in q if c.isdigit())
            cond = Q(username__icontains=q) | Q(full_name__icontains=q) | Q(email__icontains=q)
            if len(digits) >= 4:
                cond |= Q(phone__contains=digits.lstrip("0"))
            qs = qs.filter(cond)
        plan = self.request.query_params.get("plan")
        if plan:
            qs = qs.filter(subscription__plan__slug=plan)
        status = self.request.query_params.get("status")
        if status:
            qs = qs.filter(subscription__status=status)
        return qs

    @extend_schema(
        parameters=[
            OpenApiParameter("q", str),
            OpenApiParameter("plan", str),
            OpenApiParameter("status", str),
        ],
        operation_id="admin_subscribers_list",
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def _act(self, request, pk, name):
        user = self.get_object()
        data = SubscriberActionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        sub = plan_service.ensure_subscription(user)
        ip = client_ip(request)
        actor = request.user
        try:
            if name == "change_plan":
                plan = Plan.objects.filter(slug=v.get("plan", "")).first()
                if plan is None:
                    raise APIError("Choose a plan.", "validation_error", fields={"plan": "?"})
                plan_service.staff_change_plan(sub, plan, days=v.get("days"), actor=actor, ip=ip)
            elif name == "extend":
                plan_service.extend(sub, v.get("days") or 30, actor=actor, ip=ip)
            elif name == "end_trial":
                if sub.status != Subscription.Status.TRIALING:
                    raise APIError("This member isn't on a trial.", "conflict", 409)
                before = plan_service._snapshot(sub)
                sub.trial_end = timezone.now()
                sub.current_period_end = sub.trial_end
                sub.save(update_fields=["trial_end", "current_period_end", "updated_at"])
                plan_service.audit(sub, "end_trial", before, actor=actor, ip=ip)
                # The renewal job charges (or downgrades) on its next run.
            elif name == "cancel":
                plan_service.set_free(sub, actor=actor, ip=ip, reason=v.get("reason", ""))
            elif name == "reset_usage":
                scopes = [v["scope"]] if v.get("scope") else list(usage.SCOPES)
                rows = usage.reset(user, actor=actor, scopes=scopes, reason=v.get("reason", ""))
                record(
                    actor,
                    "usage.reset",
                    user,
                    changes={"scopes": scopes, "seconds": [r.seconds for r in rows]},
                    ip=ip,
                )
            elif name == "bonus":
                if not v.get("minutes"):
                    raise APIError("How many minutes?", "validation_error", fields={"minutes": "?"})
                row = usage.grant_bonus(
                    user,
                    v["minutes"],
                    v.get("scope") or "day",
                    actor=actor,
                    reason=v.get("reason", ""),
                )
                record(
                    actor,
                    "usage.bonus",
                    user,
                    changes={"minutes": v["minutes"], "scope": row.scope, "bucket": row.bucket},
                    ip=ip,
                )
        except ValueError as exc:
            raise APIError(str(exc), "conflict", 409) from exc
        user.refresh_from_db()
        return Response(SubscriberDetailSerializer(user).data)

    def _action_schema(name):  # noqa: N805
        return extend_schema(
            request=SubscriberActionSerializer,
            responses=SubscriberDetailSerializer,
            operation_id=f"admin_subscriber_{name}",
        )

    @_action_schema("change_plan")
    @action(detail=True, methods=["post"], url_path="change-plan")
    def change_plan(self, request, pk=None):
        return self._act(request, pk, "change_plan")

    @_action_schema("extend")
    @action(detail=True, methods=["post"])
    def extend(self, request, pk=None):
        return self._act(request, pk, "extend")

    @_action_schema("end_trial")
    @action(detail=True, methods=["post"], url_path="end-trial")
    def end_trial(self, request, pk=None):
        return self._act(request, pk, "end_trial")

    @_action_schema("cancel")
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._act(request, pk, "cancel")

    @_action_schema("reset_usage")
    @action(detail=True, methods=["post"], url_path="reset-usage")
    def reset_usage(self, request, pk=None):
        return self._act(request, pk, "reset_usage")

    @_action_schema("bonus")
    @action(detail=True, methods=["post"])
    def bonus(self, request, pk=None):
        return self._act(request, pk, "bonus")

    @extend_schema(responses=PaymentSerializer(many=True), operation_id="admin_subscriber_payments")
    @action(detail=True, methods=["get"], pagination_class=None)
    def payments(self, request, pk=None):
        rows = Payment.objects.filter(user=self.get_object()).select_related("plan")[:100]
        return Response(PaymentSerializer(rows, many=True).data)


BillingStats = inline_serializer(
    "BillingStats",
    {
        "paid_by_plan": inline_serializer(
            "PaidByPlan",
            {
                "plan": serializers.CharField(),
                "slug": serializers.CharField(),
                "count": serializers.IntegerField(),
            },
            many=True,
        ),
        "trials_running": serializers.IntegerField(),
        "mrr_tzs": serializers.IntegerField(),
        "renewals_due_48h": serializers.IntegerField(),
        "failed_payments_7d": serializers.IntegerField(),
        "plans": PlanSerializer(many=True),
    },
)


class BillingStatsView(APIView):
    permission_classes = [StaffPermission]
    read_roles = READ

    @extend_schema(responses=BillingStats, operation_id="admin_billing_stats")
    def get(self, request):
        now = timezone.now()
        S = Subscription.Status
        paying = Subscription.objects.filter(plan__is_free=False).filter(
            Q(status__in=[S.ACTIVE, S.PAST_DUE, S.GRACE])
            | Q(status=S.CANCELED, current_period_end__gt=now)
        )
        by_plan = (
            paying.values("plan__name", "plan__slug", "plan__price_tzs", "plan__period_days")
            .annotate(n=Count("id"))
            .order_by("plan__price_tzs")
        )
        mrr = sum(
            round(row["plan__price_tzs"] * 30 / max(1, row["plan__period_days"])) * row["n"]
            for row in by_plan
            if row["plan__price_tzs"]
        )
        due = Subscription.objects.filter(
            auto_renew=True,
            status__in=[S.ACTIVE, S.TRIALING],
            current_period_end__gt=now,
            current_period_end__lte=now + dt.timedelta(hours=48),
        ).count()
        failed = Payment.objects.filter(
            status__in=[Payment.Status.FAILED, Payment.Status.EXPIRED],
            created_at__gte=now - dt.timedelta(days=7),
        ).count()
        return Response(
            {
                "paid_by_plan": [
                    {"plan": r["plan__name"], "slug": r["plan__slug"], "count": r["n"]}
                    for r in by_plan
                ],
                "trials_running": Subscription.objects.filter(
                    status=S.TRIALING, trial_end__gt=now
                ).count(),
                "mrr_tzs": mrr,
                "renewals_due_48h": due,
                "failed_payments_7d": failed,
                "plans": PlanSerializer(Plan.objects.filter(is_active=True), many=True).data,
            }
        )


class SimulatePaymentView(APIView):
    """Test mode only: settle a simulated (mock_…) payment as if Snippe's webhook arrived."""

    permission_classes = [StaffPermission]
    read_roles = ()
    write_roles = ()  # superadmin only

    @extend_schema(
        request=inline_serializer(
            "SimulatePaymentRequest",
            {"outcome": serializers.ChoiceField(choices=["completed", "failed", "expired"])},
        ),
        responses=PaymentSerializer,
        operation_id="admin_simulate_payment",
    )
    def post(self, request, payment_id):
        from apps.messaging import outbox

        from . import payments as pay

        if not outbox.enabled():
            raise APIError("Test mode is off.", "not_found", 404)
        payment = Payment.objects.filter(public_id=payment_id).first()
        if payment is None or not (payment.reference or "").startswith("mock_"):
            raise APIError("Only simulated payments can be settled here.", "not_found", 404)
        outcome = request.data.get("outcome")
        if outcome not in ("completed", "failed", "expired"):
            raise APIError("Choose completed, failed or expired.", "validation_error")
        payment = pay.settle(
            payment.pk,
            outcome,
            {"reference": payment.reference, "status": outcome, "simulated": True},
            reason="Simulated failure" if outcome == "failed" else "",
        )
        record(
            request.user,
            "payment.simulated",
            payment,
            changes={"outcome": outcome},
            ip=client_ip(request),
        )
        return Response(PaymentSerializer(payment).data)


class RunRenewalsView(APIView):
    """Test mode only: run the renewal job and the reconcile poll now — or as of `at` — instead of
    waiting for the beat (every few minutes) and the calendar."""

    permission_classes = [StaffPermission]
    read_roles = ()
    write_roles = ()  # superadmin only

    @extend_schema(
        request=inline_serializer(
            "RenewalRunRequest", {"at": serializers.DateTimeField(required=False)}
        ),
        responses=inline_serializer(
            "RenewalRun",
            {
                "charged": serializers.IntegerField(),
                "reminded": serializers.IntegerField(),
                "grace": serializers.IntegerField(),
                "ended": serializers.IntegerField(),
                "reconciled": serializers.IntegerField(),
            },
        ),
        operation_id="admin_run_renewals",
    )
    def post(self, request):
        from apps.messaging import outbox

        from . import payments as pay
        from . import renewals

        if not outbox.enabled():
            raise APIError("Test mode is off.", "not_found", 404)
        # `at` runs the job as of another moment (test mode only), e.g. after a trial ends.
        at = serializers.DateTimeField(required=False).run_validation(
            request.data.get("at") or timezone.now().isoformat()
        )
        counts = renewals.run(at)
        counts["reconciled"] = pay.reconcile()  # payments live in real time
        record(request.user, "billing.run_renewals", changes=counts, ip=client_ip(request))
        return Response(counts)
