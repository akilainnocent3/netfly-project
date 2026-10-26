import datetime as dt
import hashlib
import hmac
import json
import time

import pytest
import responses
from django.utils import timezone
from rest_framework.test import APIClient

from apps.billing import payments as pay
from apps.billing import renewals
from apps.billing.models import Payment, PaymentEvent, Plan, Subscription
from apps.billing.plans import ensure_subscription
from apps.core.config import config
from apps.messaging import outbox

pytestmark = pytest.mark.django_db
API = "https://api.snippe.sh/v1/payments"
SECRET = "whsec_test_123"
S = Subscription.Status


@pytest.fixture
def snippe():
    config.set("payments.snippe_api_key", "snp_test_abc")
    config.set("payments.snippe_webhook_secret", SECRET)
    config.set("payments.webhook_public_url", "https://netfly.test/api/v1/payments/webhook/snippe")
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        yield rsps


@pytest.fixture
def verified(user):
    user.email, user.email_verified_at = "viewer@example.com", timezone.now()
    user.phone, user.phone_verified_at = "255754123456", timezone.now()
    user.save()
    return user


@pytest.fixture
def webhook(django_capture_on_commit_callbacks):
    """POST a signed webhook as Snippe would; the Celery task runs right away."""
    from netfly.celery import app

    app.conf.task_always_eager = True

    def send(body, **kw):
        with django_capture_on_commit_callbacks(execute=True):
            return post_webhook(APIClient(), body, **kw)

    yield send
    app.conf.task_always_eager = False


@pytest.fixture
def no_sleep(monkeypatch):
    monkeypatch.setattr("apps.billing.snippe.time.sleep", lambda s: None)


def created(reference="ref_1", status="pending"):
    return {
        "status": "success",
        "data": {
            "reference": reference,
            "status": status,
            "expires_at": (timezone.now() + dt.timedelta(hours=4)).isoformat(),
        },
    }


def signed(body: dict, *, ts: int | None = None, secret: str = SECRET) -> tuple[bytes, dict]:
    raw = json.dumps(body).encode()
    stamp = str(ts if ts is not None else int(time.time()))
    sig = hmac.new(secret.encode(), f"{stamp}.".encode() + raw, hashlib.sha256).hexdigest()
    return raw, {"HTTP_X_WEBHOOK_TIMESTAMP": stamp, "HTTP_X_WEBHOOK_SIGNATURE": sig}


def event(reference: str, kind="payment.completed", event_id="evt_1", **data):
    return {
        "id": event_id,
        "type": kind,
        "api_version": "2026-01-25",
        "created_at": timezone.now().isoformat(),
        "data": {
            "reference": reference,
            "status": kind.split(".")[1],
            "amount": {"value": 2500, "currency": "TZS"},
            "channel": {"type": "mobile", "provider": "mpesa"},
            **data,
        },
    }


def post_webhook(api, body, **kw):
    raw, headers = signed(body, **kw)
    return api.generic(
        "POST",
        "/api/v1/payments/webhook/snippe",
        raw,
        content_type="application/json",
        **headers,
    )


def checkout(api, plan="pendwa", trial=False, phone=None):
    body = {"plan": plan, "trial": trial}
    if phone:
        body["phone"] = phone
    return api.post("/api/v1/billing/checkout/start", body, format="json")


# -- creating a payment -------------------------------------------------------------------------
def test_pay_pushes_the_server_side_amount_with_an_idempotency_key(auth_api, verified, snippe):
    snippe.post(API, json=created("ref_A"), status=201)
    res = checkout(auth_api, phone="0754 123 456")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["kind"] == "payment" and body["payment"]["status"] == "pending"
    assert body["payment"]["phone_masked"] == "0754 ••• 456"
    call = snippe.calls[0].request
    sent = json.loads(call.body)
    assert call.headers["Authorization"] == "Bearer snp_test_abc"
    assert 0 < len(call.headers["Idempotency-Key"]) <= 30
    assert sent["payment_type"] == "mobile" and sent["phone_number"] == "255754123456"
    assert sent["details"] == {"amount": 2500, "currency": "TZS"}
    assert sent["metadata"]["purpose"] == "signup" and sent["metadata"]["plan"] == "pendwa"
    assert sent["webhook_url"].endswith("/api/v1/payments/webhook/snippe")
    assert sent["customer"]["email"] == "viewer@example.com"
    # A second tap returns the same pending request instead of pushing another.
    again = checkout(auth_api, phone="0754123456")
    assert again.json()["payment"]["id"] == body["payment"]["id"]
    assert len(snippe.calls) == 1


def test_amount_multiplier_and_client_amounts_are_ignored(auth_api, verified, snippe):
    config.set("payments.amount_multiplier", 100)
    snippe.post(API, json=created("ref_M"), status=201)
    res = auth_api.post(
        "/api/v1/billing/checkout/start",
        {"plan": "mwanzo", "amount": 1, "price_tzs": 1},
        format="json",
    )
    assert res.status_code == 201
    assert json.loads(snippe.calls[0].request.body)["details"]["amount"] == 150000
    assert Payment.objects.get().amount == 1500  # our record stays in shillings


def test_checkout_requires_verification_and_a_tanzanian_number(auth_api, user, snippe):
    res = checkout(auth_api)
    assert res.status_code == 409 and res.json()["steps"] == ["email", "phone"]
    user.email, user.email_verified_at = "a@b.co", timezone.now()
    user.phone, user.phone_verified_at = "255754000001", timezone.now()
    user.save()
    assert checkout(auth_api, phone="+254712345678").json()["code"] == "validation_error"


def test_provider_errors(auth_api, verified, snippe, no_sleep):
    snippe.post(API, json={"code": "unauthorized"}, status=401)
    res = checkout(auth_api)
    assert res.status_code == 502 and res.json()["code"] == "unauthorized"
    assert Payment.objects.get().status == "failed"
    # 5xx is retried with backoff (the same idempotency key), then succeeds.
    snippe.replace(responses.POST, API, status=503, json={"code": "PAY_001"})
    snippe.add(responses.POST, API, json=created("ref_R"), status=201)
    Payment.objects.all().delete()
    res = checkout(auth_api, plan="mwanzo")
    assert res.status_code == 201
    keys = {c.request.headers["Idempotency-Key"] for c in snippe.calls[1:]}
    assert len(keys) == 1


# -- webhooks ------------------------------------------------------------------------------------
def test_webhook_signature_valid_invalid_and_stale(auth_api, verified, snippe, webhook):
    snippe.post(API, json=created("ref_W"), status=201)
    checkout(auth_api)
    raw, headers = signed(event("ref_W"))
    bad = dict(headers, HTTP_X_WEBHOOK_SIGNATURE="0" * 64)
    resp = APIClient().generic("POST", "/api/v1/payments/webhook/snippe", raw, **bad)
    assert resp.status_code == 401
    stale = webhook(event("ref_W"), ts=int(time.time()) - 301)
    assert stale.status_code == 401
    wrong_secret = webhook(event("ref_W"), secret="whsec_other")
    assert wrong_secret.status_code == 401
    assert Payment.objects.get().status == "pending"
    ok = webhook(event("ref_W"))
    assert ok.status_code == 200 and ok.content == b"OK"
    payment = Payment.objects.get()
    assert payment.status == "completed" and payment.applied_at
    sub = ensure_subscription(verified)
    assert sub.status == S.ACTIVE and sub.plan.slug == "pendwa"
    assert PaymentEvent.objects.filter(signature_valid=False).count() == 3


def test_duplicate_webhooks_apply_once(auth_api, verified, snippe, webhook):
    snippe.post(API, json=created("ref_D"), status=201)
    checkout(auth_api)
    for _ in range(3):  # Snippe retries (3, 6, 12, 24 min): same event id
        assert webhook(event("ref_D", event_id="evt_same")).status_code == 200
    # A different event for the same payment (e.g. a late duplicate) changes nothing either.
    webhook(event("ref_D", event_id="evt_other"))
    assert PaymentEvent.objects.filter(signature_valid=True).count() == 2
    sub = ensure_subscription(verified)
    first_end = sub.current_period_end
    assert first_end - timezone.now() > dt.timedelta(days=29)
    webhook(event("ref_D", kind="payment.failed", event_id="evt_late"))
    sub.refresh_from_db()
    assert Payment.objects.get().status == "completed" and sub.current_period_end == first_end


def test_reconcile_settles_a_lost_webhook_and_expires_old_requests(auth_api, verified, snippe):
    snippe.post(API, json=created("ref_L"), status=201)
    checkout(auth_api)
    snippe.get(f"{API}/ref_L", json={"data": {"reference": "ref_L", "status": "completed"}})
    assert pay.reconcile() == 1
    assert ensure_subscription(verified).plan.slug == "pendwa"
    stale = Payment.objects.create(
        idempotency_key="nfstale",
        reference="ref_old",
        user=verified,
        subscription=ensure_subscription(verified),
        plan=Plan.objects.get(slug="kinara"),
        purpose="upgrade",
        amount=5000,
        phone="255754123456",
        status="pending",
        expires_at=timezone.now() - dt.timedelta(minutes=1),
    )
    snippe.get(f"{API}/ref_old", json={"data": {"reference": "ref_old", "status": "pending"}})
    pay.reconcile()
    stale.refresh_from_db()
    assert stale.status == "expired"


# -- trials, renewals, grace, downgrade ---------------------------------------------------------------
def _trial(auth_api, verified):
    res = checkout(auth_api, trial=True)
    assert res.status_code == 201 and res.json()["kind"] == "trial"
    return ensure_subscription(verified)


def test_trial_starts_without_a_charge_and_is_one_per_person(auth_api, verified, snippe):
    sub = _trial(auth_api, verified)
    assert sub.status == S.TRIALING and sub.plan.slug == "pendwa"
    assert (sub.trial_end - timezone.now()).days in (6, 7)
    assert sub.payment_phone == "255754123456"
    assert not snippe.calls  # no charge
    assert checkout(auth_api, trial=True).json()["code"] == "trial_unavailable"


def test_trial_converts_at_its_end(auth_api, verified, snippe, webhook):
    config.set("testing.mock_providers", False)
    sub = _trial(auth_api, verified)
    snippe.post(API, json=created("ref_T"), status=201)
    snippe.post("https://apisms.beem.africa/v1/send", json={"successful": True, "code": 100})
    config.set("sms.api_key", "k")
    config.set("sms.secret_key", "s")
    assert renewals.run(sub.trial_end - dt.timedelta(hours=1))["charged"] == 0  # not yet
    counts = renewals.run(sub.trial_end + dt.timedelta(minutes=1))
    assert counts["charged"] == 1 and counts["reminded"] == 1 and counts["grace"] == 1
    payment = Payment.objects.get()
    assert payment.purpose == "trial_conversion" and payment.amount == 2500
    # The member keeps the plan's limits while the request is pending (grace).
    sub.refresh_from_db()
    assert sub.status == S.GRACE and sub.plan.slug == "pendwa"
    webhook(event("ref_T"))
    sub.refresh_from_db()
    assert sub.status == S.ACTIVE
    # No drift: the paid period follows the trial.
    assert sub.current_period_start == sub.trial_end
    assert sub.current_period_end == sub.trial_end + dt.timedelta(days=30)


def test_failed_conversion_retries_then_grace_then_free(auth_api, verified, snippe, webhook):
    config.set("testing.mock_providers", True)  # requests + SMS are simulated here
    sub = _trial(auth_api, verified)
    end = sub.trial_end
    renewals.run(end + dt.timedelta(minutes=1))  # attempt 1
    first = Payment.objects.get()
    pay.settle(first.pk, "failed")
    sub.refresh_from_db()
    assert sub.status == S.GRACE  # past its end, unpaid: grace keeps the limits
    assert renewals.run(end + dt.timedelta(hours=2))["charged"] == 0  # next try at +24 h
    assert renewals.run(end + dt.timedelta(hours=24, minutes=1))["charged"] == 1
    pay.settle(Payment.objects.latest("created_at").pk, "expired")
    counts = renewals.run(end + dt.timedelta(days=3, minutes=1))
    assert counts["ended"] == 1
    sub.refresh_from_db()
    assert sub.status == S.EXPIRED and sub.plan.is_free
    assert "free plan" in sub.notice
    sms = outbox.read("sms", "255754123456")[0]["body"]
    assert "moved to the free plan" in sms
    usage = auth_api.get("/api/v1/billing/usage").json()
    assert usage["notice"]["text"].startswith("We couldn't take payment")
    auth_api.post("/api/v1/billing/notice/dismiss")
    assert auth_api.get("/api/v1/billing/usage").json()["notice"] is None
    config.set("testing.mock_providers", False)


def test_renewal_is_requested_ahead_and_extends_without_drift(verified, snippe, webhook):
    config.set("testing.mock_providers", True)
    sub = ensure_subscription(verified)
    end = timezone.now() + dt.timedelta(days=2)
    Subscription.objects.filter(pk=sub.pk).update(
        plan=Plan.objects.get(slug="kinara"),
        status=S.ACTIVE,
        current_period_start=end - dt.timedelta(days=30),
        current_period_end=end,
        payment_phone="255754123456",
    )
    assert renewals.run(end - dt.timedelta(hours=25))["charged"] == 0
    assert renewals.run(end - dt.timedelta(hours=23))["charged"] == 1
    assert renewals.run(end - dt.timedelta(hours=22))["charged"] == 0  # one pending at a time
    payment = Payment.objects.get()
    assert payment.purpose == "renewal" and payment.amount == 5000
    pay.settle(payment.pk, "completed")
    sub.refresh_from_db()
    assert sub.current_period_end == end + dt.timedelta(days=30)
    config.set("testing.mock_providers", False)


def test_cancelled_plan_runs_to_its_end_then_free(auth_api, verified):
    config.set("testing.mock_providers", True)
    sub = ensure_subscription(verified)
    end = timezone.now() + dt.timedelta(days=5)
    Subscription.objects.filter(pk=sub.pk).update(
        plan=Plan.objects.get(slug="pendwa"),
        status=S.ACTIVE,
        current_period_start=timezone.now(),
        current_period_end=end,
    )
    auth_api.post("/api/v1/billing/auto-renew", {"on": False}, format="json")
    assert renewals.run(end - dt.timedelta(hours=1)) == {
        "charged": 0,
        "reminded": 0,
        "grace": 0,
        "ended": 0,
    }
    assert not Payment.objects.exists()
    renewals.run(end + dt.timedelta(minutes=1))
    sub.refresh_from_db()
    assert sub.plan.is_free and sub.status == S.EXPIRED
    config.set("testing.mock_providers", False)


def test_upgrade_starts_on_payment_and_downgrade_waits(auth_api, verified, snippe, webhook):
    sub = ensure_subscription(verified)
    end = timezone.now() + dt.timedelta(days=10)
    Subscription.objects.filter(pk=sub.pk).update(
        plan=Plan.objects.get(slug="mwanzo"),
        status=S.ACTIVE,
        current_period_start=end - dt.timedelta(days=30),
        current_period_end=end,
    )
    snippe.post(API, json=created("ref_U"), status=201)
    res = checkout(auth_api, plan="kinara")
    assert json.loads(snippe.calls[0].request.body)["metadata"]["purpose"] == "upgrade"
    sub.refresh_from_db()
    assert sub.plan.slug == "mwanzo"  # nothing changes before the money arrives
    webhook(event("ref_U"))
    sub.refresh_from_db()
    assert sub.plan.slug == "kinara"
    assert abs((sub.current_period_start - timezone.now()).total_seconds()) < 60
    assert res.status_code == 201
    # Downgrade: scheduled for the end of the paid period, no charge now.
    down = auth_api.post("/api/v1/billing/plan", {"plan": "mwanzo"}, format="json").json()
    assert down["status"] == "scheduled"
    sub.refresh_from_db()
    assert sub.plan.slug == "kinara" and sub.scheduled_plan.slug == "mwanzo"
    assert len(snippe.calls) == 1


def test_polling_a_pending_payment_asks_snippe_without_waiting_for_the_webhook(
    auth_api, verified, snippe
):
    snippe.post(API, json=created("ref_F"), status=201)
    pid = checkout(auth_api).json()["payment"]["id"]
    snippe.get(f"{API}/ref_F", json={"data": {"reference": "ref_F", "status": "completed"}})
    assert auth_api.get(f"/api/v1/billing/payments/{pid}").json()["status"] == "completed"
    assert ensure_subscription(verified).plan.slug == "pendwa"
    assert auth_api.get(f"/api/v1/billing/payments/{pid}").json()["status"] == "completed"
    assert len([c for c in snippe.calls if c.request.method == "GET"]) == 1  # final: no more asks


def test_payment_status_and_history_are_private(auth_api, verified, snippe, staff_api):
    snippe.post(API, json=created("ref_P"), status=201)
    pid = checkout(auth_api).json()["payment"]["id"]
    snippe.get(f"{API}/ref_P", json={"data": {"reference": "ref_P", "status": "pending"}})
    assert auth_api.get(f"/api/v1/billing/payments/{pid}").json()["status"] == "pending"
    assert auth_api.get("/api/v1/billing/payments").json()[0]["id"] == pid
    assert APIClient().get(f"/api/v1/billing/payments/{pid}").status_code in (401, 403)
    other = staff_api.get(f"/api/v1/billing/payments/{pid}")
    assert other.status_code == 404
    listed = staff_api.get(f"/api/v1/admin/subscribers/{verified.pk}/payments").json()
    assert listed[0]["reference"] == "ref_P"


def test_test_mode_simulator(auth_api, verified, staff_api):
    config.set("testing.mock_providers", True)
    pid = checkout(auth_api).json()["payment"]["id"]
    res = staff_api.post(
        f"/api/v1/admin/testing/payments/{pid}/simulate", {"outcome": "completed"}, format="json"
    )
    assert res.status_code == 200 and res.json()["status"] == "completed"
    assert ensure_subscription(verified).plan.slug == "pendwa"
    config.set("testing.mock_providers", False)
    assert (
        staff_api.post(
            f"/api/v1/admin/testing/payments/{pid}/simulate", {"outcome": "failed"}, format="json"
        ).status_code
        == 404
    )


def test_studio_test_api_key(staff_api, snippe):
    snippe.get(f"{API}?limit=1&offset=0", json={"data": [{"reference": "r"}]})
    res = staff_api.post("/api/v1/admin/payments/test").json()
    assert res["ok"] and "accepted the API key" in res["message"]
    assert res["webhook_url"].endswith("/api/v1/payments/webhook/snippe")


def test_run_renewals_now_is_test_mode_only(staff_api, content_manager_api):
    assert staff_api.post("/api/v1/admin/testing/run-renewals").status_code == 404
    config.set("testing.mock_providers", True)
    assert content_manager_api.post("/api/v1/admin/testing/run-renewals").status_code == 403
    res = staff_api.post("/api/v1/admin/testing/run-renewals")
    assert res.status_code == 200 and set(res.json()) >= {"charged", "ended", "reconciled"}
    later = (timezone.now() + dt.timedelta(days=40)).isoformat()
    assert (
        staff_api.post(
            "/api/v1/admin/testing/run-renewals", {"at": later}, format="json"
        ).status_code
        == 200
    )
    config.set("testing.mock_providers", False)
