from rest_framework import serializers

from .models import Plan, Subscription, UsageAdjustment


class PlanSerializer(serializers.ModelSerializer):
    feature_bullets = serializers.ListField(child=serializers.CharField())

    class Meta:
        model = Plan
        fields = [
            "id",
            "slug",
            "name",
            "tagline",
            "price_tzs",
            "period_days",
            "daily_limit_minutes",
            "weekly_limit_minutes",
            "monthly_limit_minutes",
            "trial_eligible",
            "is_free",
            "is_default",
            "highlight_label",
            "order",
            "feature_bullets",
        ]
        # A response shape only (Studio writes through AdminPlanSerializer).
        read_only_fields = fields


class AdminPlanSerializer(serializers.ModelSerializer):
    subscribers = serializers.IntegerField(read_only=True, default=0)
    # Declared explicitly: no generated per-field unique validator (see Meta.validators).
    is_default = serializers.BooleanField(required=False)
    feature_bullets = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False, default=list
    )

    class Meta:
        model = Plan
        fields = [*PlanSerializer.Meta.fields, "is_active", "subscribers", "updated_at"]
        read_only_fields = ["id", "updated_at", "subscribers"]
        # "One default" is handed over atomically in the view (the DB constraint backs it up);
        # DRF's generated unique-constraint validator would reject the handover itself.
        validators: list = []

    def validate_feature_bullets(self, value):
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise serializers.ValidationError("Use a list of short lines.")
        if len(value) > 8 or any(len(v) > 80 for v in value):
            raise serializers.ValidationError("At most 8 lines of 80 characters.")
        return [v.strip() for v in value if v.strip()]

    def validate(self, attrs):
        instance = self.instance
        get = lambda k: attrs.get(k, getattr(instance, k, None))  # noqa: E731
        if get("is_free") and (get("price_tzs") or 0) > 0:
            raise serializers.ValidationError({"price_tzs": "A free plan costs nothing."})
        if not get("is_free") and not get("price_tzs"):
            raise serializers.ValidationError({"price_tzs": "Paid plans need a price."})
        if get("is_default") and not (get("is_free") and get("is_active") is not False):
            raise serializers.ValidationError(
                {"is_default": "The default plan must be free and active."}
            )
        for scope in ("daily", "weekly", "monthly"):
            v = get(f"{scope}_limit_minutes")
            if v is not None and not 1 <= v <= 60 * 24 * 31:
                raise serializers.ValidationError({f"{scope}_limit_minutes": "Out of range."})
        return attrs


class UsageWindowsSerializer(serializers.Serializer):
    day = serializers.IntegerField(allow_null=True)
    week = serializers.IntegerField(allow_null=True)
    month = serializers.IntegerField(allow_null=True)


class ResetsSerializer(serializers.Serializer):
    day = serializers.DateTimeField()
    week = serializers.DateTimeField()
    month = serializers.DateTimeField()


class UsagePlanSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    is_free = serializers.BooleanField()


class UsageSnapshotSerializer(serializers.Serializer):
    plan = UsagePlanSerializer()
    exempt = serializers.BooleanField()
    allowed = serializers.BooleanField()
    limit_reached = serializers.ChoiceField(choices=UsageAdjustment.Scope.choices, allow_null=True)
    limits = UsageWindowsSerializer()
    used = UsageWindowsSerializer()
    remaining = UsageWindowsSerializer()
    remaining_seconds = serializers.IntegerField(allow_null=True)
    resets_at = ResetsSerializer()
    warn_at_minutes = serializers.ListField(child=serializers.IntegerField())
    heartbeat_seconds = serializers.IntegerField()
    server_time = serializers.DateTimeField()


class HeartbeatRequestSerializer(serializers.Serializer):
    session_id = serializers.RegexField(r"^[0-9a-f]{32}$")
    watched = serializers.FloatField(min_value=0, max_value=3600, default=0)
    playing = serializers.BooleanField(default=True)


class HeartbeatResponseSerializer(UsageSnapshotSerializer):
    credited = serializers.FloatField()


class SubscriptionSerializer(serializers.ModelSerializer):
    plan = PlanSerializer()
    scheduled_plan = PlanSerializer(allow_null=True)
    payment_phone_masked = serializers.SerializerMethodField()
    payment_network = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            "plan",
            "status",
            "current_period_start",
            "current_period_end",
            "trial_start",
            "trial_end",
            "auto_renew",
            "cancel_at_period_end",
            "scheduled_plan",
            "payment_phone_masked",
            "payment_network",
            "grace_until",
        ]
        read_only_fields = fields

    def get_payment_phone_masked(self, obj) -> str:
        from apps.accounts.phone import masked

        return masked(obj.payment_phone) if obj.payment_phone else ""

    def get_payment_network(self, obj) -> str | None:
        from apps.accounts.phone import network

        return network(obj.payment_phone) if obj.payment_phone else None


class TrialInfoSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    days = serializers.IntegerField()
    eligible = serializers.BooleanField()


class MembershipSerializer(serializers.Serializer):
    subscription = SubscriptionSerializer()
    usage = UsageSnapshotSerializer()
    trial = TrialInfoSerializer()


class PlansResponseSerializer(serializers.Serializer):
    plans = PlanSerializer(many=True)
    trial_enabled = serializers.BooleanField()
    trial_days = serializers.IntegerField()
    currency = serializers.CharField()


class ChoosePlanSerializer(serializers.Serializer):
    plan = serializers.SlugField()
    trial = serializers.BooleanField(default=False, required=False)


class ChoosePlanResultSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["applied", "scheduled", "needs"])
    steps = serializers.ListField(child=serializers.CharField())
    subscription = SubscriptionSerializer()


class AutoRenewSerializer(serializers.Serializer):
    on = serializers.BooleanField()


class CheckoutSerializer(serializers.Serializer):
    plan = PlanSerializer()
    trial = serializers.BooleanField()
    trial_days = serializers.IntegerField()
    steps = serializers.ListField(child=serializers.CharField())
    amount_tzs = serializers.IntegerField()
    payment_phone = serializers.CharField(allow_blank=True)
    payment_network = serializers.CharField(allow_null=True)
