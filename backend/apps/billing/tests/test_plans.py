import datetime as dt

import pytest
from django.utils import timezone

from apps.billing.models import Plan, Subscription, TrialClaim
from apps.billing.plans import ensure_subscription
from apps.core.models import AuditLog

pytestmark = pytest.mark.django_db


def test_public_plan_list_is_ordered_and_only_differs_by_limits(api):
    body = api.get("/api/v1/billing/plans").json()
    plans = body["plans"]
    assert [p["slug"] for p in plans] == ["bure", "mwanzo", "pendwa", "kinara"]
    assert [p["price_tzs"] for p in plans] == [0, 1500, 2500, 5000]
    assert plans[0]["is_free"] and plans[0]["is_default"]
    assert plans[2]["highlight_label"] == "Most popular"
    # Every plan, including the highest, has all three limits.
    assert all(p["daily_limit_minutes"] and p["monthly_limit_minutes"] for p in plans)
    # Same quality everywhere: no quality / resolution / device fields exist at all.
    assert not {"quality", "max_height", "devices", "downloads"} & set(plans[0])


def test_choosing_free_applies_instantly(auth_api):
    res = auth_api.post("/api/v1/billing/plan", {"plan": "bure"}, format="json").json()
    assert res["status"] == "applied" and res["steps"] == []
    assert res["subscription"]["plan"]["slug"] == "bure"


def test_paid_plan_needs_email_phone_then_payment(auth_api):
    res = auth_api.post("/api/v1/billing/plan", {"plan": "pendwa"}, format="json").json()
    assert res == {**res, "status": "needs", "steps": ["email", "phone", "payment"]}
    user = auth_api.user
    user.email, user.email_verified_at = "v@example.com", timezone.now()
    user.save()
    res = auth_api.post("/api/v1/billing/plan", {"plan": "pendwa"}, format="json").json()
    assert res["steps"] == ["phone", "payment"]


def test_trial_needs_verification_and_one_per_person(auth_api):
    res = auth_api.post("/api/v1/billing/plan", {"plan": "pendwa", "trial": True}, format="json")
    assert res.json()["steps"] == ["email", "phone", "trial"]
    TrialClaim.objects.create(user=auth_api.user)
    again = auth_api.post("/api/v1/billing/plan", {"plan": "pendwa", "trial": True}, format="json")
    assert again.status_code == 409 and again.json()["code"] == "trial_unavailable"
    assert auth_api.get("/api/v1/billing/membership").json()["trial"]["eligible"] is False


def test_trial_is_per_phone_and_email_too(auth_api, staff):
    from apps.accounts.models import User

    other = User.objects.create_user("first_one", "correct-horse")
    TrialClaim.objects.create(user=other, phone="255712345678", email="same@example.com")
    me = auth_api.user
    me.phone, me.phone_verified_at = "255712345678", timezone.now()
    me.save()
    assert auth_api.get("/api/v1/billing/membership").json()["trial"]["eligible"] is False


def test_downgrade_waits_for_period_end(auth_api):
    sub = ensure_subscription(auth_api.user)
    sub.plan = Plan.objects.get(slug="kinara")
    sub.status = "active"
    sub.current_period_start = timezone.now()
    sub.current_period_end = timezone.now() + dt.timedelta(days=20)
    sub.save()
    res = auth_api.post("/api/v1/billing/plan", {"plan": "mwanzo"}, format="json").json()
    assert res["status"] == "scheduled"
    sub.refresh_from_db()
    assert sub.plan.slug == "kinara" and sub.scheduled_plan.slug == "mwanzo"
    # Going free from a paid plan also waits (the plan stays until the period ends).
    res = auth_api.post("/api/v1/billing/plan", {"plan": "bure"}, format="json").json()
    assert res["status"] == "scheduled"
    sub.refresh_from_db()
    assert sub.plan.slug == "kinara" and not sub.auto_renew


def test_membership_and_auto_renew(auth_api):
    sub = ensure_subscription(auth_api.user)
    sub.plan = Plan.objects.get(slug="pendwa")
    sub.status = "active"
    sub.current_period_end = timezone.now() + dt.timedelta(days=10)
    sub.payment_phone = "255712345678"
    sub.save()
    body = auth_api.get("/api/v1/billing/membership").json()
    assert body["subscription"]["payment_phone_masked"] == "0712 ••• 678"
    assert body["subscription"]["payment_network"] == "mixx"
    off = auth_api.post("/api/v1/billing/auto-renew", {"on": False}, format="json").json()
    assert off["auto_renew"] is False and off["status"] == "canceled"
    # Canceled keeps the paid plan's limits until the period ends.
    assert auth_api.get("/api/v1/billing/usage").json()["plan"]["slug"] == "pendwa"
    on = auth_api.post("/api/v1/billing/auto-renew", {"on": True}, format="json").json()
    assert on["status"] == "active"
    assert AuditLog.objects.filter(action__startswith="subscription.auto_renew").count() == 2


# -- Studio ---------------------------------------------------------------------------
def test_exactly_one_default_free_plan(staff_api):
    bure = Plan.objects.get(slug="bure")
    res = staff_api.patch(f"/api/v1/admin/plans/{bure.pk}", {"is_default": False}, format="json")
    assert res.status_code == 400
    res = staff_api.patch(f"/api/v1/admin/plans/{bure.pk}", {"is_active": False}, format="json")
    assert res.status_code == 400
    new = staff_api.post(
        "/api/v1/admin/plans",
        {
            "name": "Bure Plus",
            "slug": "bure-plus",
            "price_tzs": 0,
            "is_free": True,
            "is_default": True,
            "daily_limit_minutes": 90,
            "weekly_limit_minutes": 300,
            "monthly_limit_minutes": 900,
        },
        format="json",
    )
    assert new.status_code == 201, new.json()
    assert list(Plan.objects.filter(is_default=True).values_list("slug", flat=True)) == [
        "bure-plus"
    ]
    paid_default = staff_api.patch(
        f"/api/v1/admin/plans/{Plan.objects.get(slug='kinara').pk}",
        {"is_default": True},
        format="json",
    )
    assert paid_default.status_code == 400


def test_plan_writes_are_superadmin_only_and_audited(content_manager_api, staff_api):
    pendwa = Plan.objects.get(slug="pendwa")
    assert content_manager_api.get("/api/v1/admin/plans").status_code == 200
    assert (
        content_manager_api.patch(
            f"/api/v1/admin/plans/{pendwa.pk}", {"price_tzs": 1}, format="json"
        ).status_code
        == 403
    )
    res = staff_api.patch(f"/api/v1/admin/plans/{pendwa.pk}", {"price_tzs": 3000}, format="json")
    assert res.status_code == 200
    assert AuditLog.objects.filter(action="plan.update").exists()


def test_plan_with_members_cannot_be_deleted(staff_api, user):
    bure = Plan.objects.get(slug="bure")
    assert staff_api.delete(f"/api/v1/admin/plans/{bure.pk}").status_code == 409
    mwanzo = Plan.objects.get(slug="mwanzo")
    ensure_subscription(user)
    Subscription.objects.filter(user=user).update(plan=mwanzo, status="active")
    assert staff_api.delete(f"/api/v1/admin/plans/{mwanzo.pk}").status_code == 409


def test_subscriber_actions(staff_api, user):
    url = f"/api/v1/admin/subscribers/{user.pk}"
    assert staff_api.get("/api/v1/admin/subscribers?q=viewer").json()["count"] == 1
    res = staff_api.post(f"{url}/change-plan", {"plan": "pendwa", "days": 14}, format="json")
    assert res.status_code == 200 and res.json()["plan_slug"] == "pendwa"
    res = staff_api.post(f"{url}/extend", {"days": 7}, format="json").json()
    end = dt.datetime.fromisoformat(res["current_period_end"])
    assert (end - timezone.now()).days >= 20
    res = staff_api.post(f"{url}/bonus", {"minutes": 30, "scope": "day"}, format="json").json()
    assert res["usage"]["limits"]["day"] == (240 + 30) * 60
    assert staff_api.post(f"{url}/reset-usage", {}, format="json").status_code == 200
    res = staff_api.post(f"{url}/cancel", {"reason": "requested"}, format="json").json()
    assert res["plan_slug"] == "bure" and res["status"] == "free"
    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {"subscription.staff_change_plan", "subscription.extend", "usage.bonus"} <= actions
    assert "usage.reset" in actions and "subscription.free" in actions


def test_subscriber_actions_need_superadmin(content_manager_api, user):
    res = content_manager_api.post(
        f"/api/v1/admin/subscribers/{user.pk}/bonus", {"minutes": 30}, format="json"
    )
    assert res.status_code == 403


def test_billing_stats(staff_api, user):
    sub = ensure_subscription(user)
    sub.plan = Plan.objects.get(slug="pendwa")
    sub.status = "active"
    sub.current_period_end = timezone.now() + dt.timedelta(hours=30)
    sub.save()
    stats = staff_api.get("/api/v1/admin/billing/stats").json()
    assert stats["mrr_tzs"] == 2500
    assert stats["paid_by_plan"] == [{"plan": "Pendwa", "slug": "pendwa", "count": 1}]
    assert stats["renewals_due_48h"] == 1
