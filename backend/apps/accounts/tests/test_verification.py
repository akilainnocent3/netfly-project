import base64
import datetime as dt
import json
import logging
import re

import pytest
import responses
from django.core import mail as django_mail
from django.utils import timezone

from apps.accounts.models import User, VerificationCode
from apps.core.config import config
from apps.messaging import outbox

pytestmark = pytest.mark.django_db
BEEM_SEND = "https://apisms.beem.africa/v1/send"


@pytest.fixture
def mock_mode():
    config.set("testing.mock_providers", True)
    yield
    config.set("testing.mock_providers", False)


@pytest.fixture
def beem():
    config.set("testing.mock_providers", False)
    config.set("sms.api_key", "key-123")
    config.set("sms.secret_key", "secret-456")
    config.set("sms.sender_id", "NETFLY")
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        yield rsps


def last_code(kind: str, to: str) -> str:
    body = outbox.read(kind, to)[0]["body"]
    return re.search(r"\b(\d{6})\b", body).group(1)


def start(api, channel, value):
    return api.post(f"/api/v1/auth/verify/{channel}/start", {"value": value}, format="json")


def confirm(api, channel, code):
    return api.post(f"/api/v1/auth/verify/{channel}/confirm", {"code": code}, format="json")


def test_email_code_verifies_the_address(auth_api, mock_mode):
    res = start(auth_api, "email", "  Neema@Example.COM ")
    assert res.status_code == 201, res.json()
    sent = res.json()
    assert sent["target"] == "neema@example.com" and sent["sent_to"] == "n•••a@example.com"
    assert sent["length"] == 6 and sent["resend_in"] == 60
    message = outbox.read("email", "neema@example.com")[0]
    code = last_code("email", "neema@example.com")
    assert code in message["subject"] and "Viewer One" in message["body"]
    status = auth_api.get("/api/v1/auth/verify").json()
    assert status["email"]["pending"]["sent_to"] == "n•••a@example.com"
    assert status["email"]["verified"] is False

    wrong = confirm(auth_api, "email", "000000" if code != "000000" else "111111")
    assert wrong.status_code == 400 and wrong.json()["code"] == "invalid_code"
    assert wrong.json()["attempts_left"] == 4
    ok = confirm(auth_api, "email", code)
    assert ok.status_code == 200, ok.json()
    assert ok.json()["user"]["email"] == "neema@example.com"
    assert ok.json()["user"]["email_verified"] is True
    # Only an HMAC is stored, and the code can't be used twice.
    row = VerificationCode.objects.get(user=auth_api.user)
    assert code not in row.code_hash and row.consumed_at
    assert confirm(auth_api, "email", code).json()["code"] == "no_code"


def test_phone_code_with_webotp_line(auth_api, mock_mode):
    res = start(auth_api, "phone", "0712 345 678")
    assert res.status_code == 201
    assert res.json()["target"] == "255712345678"
    assert res.json()["sent_to"] == "0712 ••• 678" and res.json()["network"] == "mixx"
    body = outbox.read("sms", "255712345678")[0]["body"]
    code = last_code("sms", "255712345678")
    # The last line is the WebOTP format so Android Chrome can fill the code in.
    assert body.splitlines()[-1] == f"@testserver #{code}"
    assert confirm(auth_api, "phone", code).json()["user"]["phone_verified"] is True


def test_resend_cooldown_hourly_cap_and_supersede(auth_api, mock_mode, monkeypatch):
    assert start(auth_api, "email", "a@example.com").status_code == 201
    again = start(auth_api, "email", "a@example.com")
    assert again.status_code == 429 and again.json()["code"] == "resend_cooldown"
    assert 0 < again.json()["retry_in"] <= 60
    first = last_code("email", "a@example.com")
    config.set("email.resend_cooldown_seconds", 10)
    VerificationCode.objects.update(created_at=timezone.now() - dt.timedelta(seconds=30))
    assert start(auth_api, "email", "a@example.com").status_code == 201
    second = last_code("email", "a@example.com")
    if first != second:  # the old code stopped working
        assert confirm(auth_api, "email", first).json()["code"] == "invalid_code"
    config.set("email.max_sends_per_hour", 2)
    VerificationCode.objects.update(created_at=timezone.now() - dt.timedelta(seconds=30))
    capped = start(auth_api, "email", "a@example.com")
    assert capped.status_code == 429 and capped.json()["code"] == "too_many_codes"


def test_attempt_limit_and_expiry(auth_api, mock_mode):
    start(auth_api, "phone", "0754 000 111")
    code = last_code("sms", "255754000111")
    bad = "999999" if code != "999999" else "888888"
    for _ in range(5):
        confirm(auth_api, "phone", bad)
    blocked = confirm(auth_api, "phone", code)
    assert blocked.status_code == 429 and blocked.json()["code"] == "too_many_attempts"

    VerificationCode.objects.all().delete()
    start(auth_api, "phone", "0754 000 111")
    code = last_code("sms", "255754000111")
    VerificationCode.objects.update(expires_at=timezone.now() - dt.timedelta(seconds=1))
    assert confirm(auth_api, "phone", code).json()["code"] == "code_expired"


def test_verified_contact_belongs_to_one_account(auth_api, mock_mode):
    other = User.objects.create_user("other_one", "pw-12345678", full_name="Other")
    other.email, other.email_verified_at = "taken@example.com", timezone.now()
    other.phone = "255765000000"  # claimed, never verified
    other.save()
    taken = start(auth_api, "email", "TAKEN@example.com")
    assert taken.status_code == 409 and taken.json()["fields"]["value"]
    # Verifying a number another account only claimed releases it from that account.
    start(auth_api, "phone", "0765 000 000")
    assert confirm(auth_api, "phone", last_code("sms", "255765000000")).status_code == 200
    other.refresh_from_db()
    assert other.phone is None


def test_invalid_input(auth_api, mock_mode):
    assert start(auth_api, "email", "not-an-email").json()["fields"]["value"]
    assert start(auth_api, "phone", "0812 345 678").json()["code"] == "validation_error"
    assert start(auth_api, "fax", "x").status_code == 404


def test_beem_sms_request_and_errors(auth_api, beem, caplog):
    beem.post(
        BEEM_SEND,
        json={"successful": True, "request_id": 4242, "code": 100, "valid": 1},
    )
    res = start(auth_api, "phone", "0688 123 456")
    assert res.status_code == 201 and res.json()["network"] == "airtel"
    call = beem.calls[0]
    body = json.loads(call.request.body)
    assert body["source_addr"] == "NETFLY" and body["encoding"] == 0
    assert body["recipients"] == [{"recipient_id": 1, "dest_addr": "255688123456"}]
    expected = base64.b64encode(b"key-123:secret-456").decode()
    assert call.request.headers["Authorization"] == f"Basic {expected}"
    code = re.search(r"#(\d{6})$", body["message"]).group(1)
    assert confirm(auth_api, "phone", code).status_code == 200

    # Bad credentials: nothing is stored, the viewer gets a calm message, nothing secret is logged.
    beem.replace(responses.POST, BEEM_SEND, json={"successful": False, "code": 120}, status=401)
    VerificationCode.objects.all().delete()
    with caplog.at_level(logging.INFO):
        failed = start(auth_api, "phone", "0688 123 457")
    assert failed.status_code == 502 and failed.json()["code"] == "send_failed"
    assert not VerificationCode.objects.exists()
    assert "secret-456" not in caplog.text and "#" not in caplog.text


def test_beem_otp_provider(auth_api, beem):
    config.set("sms.otp_provider", "beem_otp")
    config.set("sms.beem_otp_app_id", "77")
    beem.post(
        "https://apiotp.beem.africa/v1/request",
        json={"data": {"pinId": "pin-abc", "message": {"code": 100, "message": "SMS sent"}}},
    )
    beem.post(
        "https://apiotp.beem.africa/v1/verify",
        json={"data": {"message": {"code": 117, "message": "Valid Pin"}}},
    )
    assert start(auth_api, "phone", "0745 111 222").status_code == 201
    assert json.loads(beem.calls[0].request.body) == {"appId": 77, "msisdn": "255745111222"}
    assert VerificationCode.objects.get().provider_ref == "pin-abc"
    assert confirm(auth_api, "phone", "4321").status_code == 200
    assert json.loads(beem.calls[1].request.body) == {"pinId": "pin-abc", "pin": "4321"}


def test_smtp_email_uses_the_templates(auth_api, monkeypatch):
    config.set("email.smtp_host", "smtp.example.com")
    config.set("email.from_email", "no-reply@netfly.test")
    config.set("email.code_subject", "Code {code} for {site_name}")
    config.set("email.code_body", "Hi {name}, use {code} within {minutes} min. {unknown}")
    sent = []
    monkeypatch.setattr(
        "django.core.mail.backends.smtp.EmailBackend.send_messages",
        lambda self, messages: sent.extend(messages) or len(messages),
    )
    assert start(auth_api, "email", "viewer@example.com").status_code == 201
    message = sent[0]
    code = re.search(r"Code (\d{6})", message.subject).group(1)
    assert message.to == ["viewer@example.com"] and "no-reply@netfly.test" in message.from_email
    assert message.body == f"Hi Viewer One, use {code} within 10 min. {{unknown}}"
    assert django_mail.outbox == []  # never the test backend: our SMTP connection was used


def test_email_not_configured(auth_api):
    res = start(auth_api, "email", "viewer@example.com")
    assert res.status_code == 502 and res.json()["code"] == "send_failed"


# -- forgot password --------------------------------------------------------------------------
def test_password_reset_with_a_verified_phone(api, user, mock_mode):
    user.phone, user.phone_verified_at = "255712000111", timezone.now()
    user.save()
    res = api.post(
        "/api/v1/auth/password-reset/start", {"identifier": "0712 000 111"}, format="json"
    )
    token = res.json()["reset_token"]
    code = last_code("sms", "255712000111")
    weak = api.post(
        "/api/v1/auth/password-reset/confirm",
        {"reset_token": token, "code": code, "new_password": "short"},
        format="json",
    )
    assert weak.status_code == 400
    done = api.post(
        "/api/v1/auth/password-reset/confirm",
        {"reset_token": token, "code": code, "new_password": "a-whole-new-phrase"},
        format="json",
    )
    assert done.status_code == 200 and done.json()["access"]
    user.refresh_from_db()
    assert user.check_password("a-whole-new-phrase") and user.token_version == 1
    login = api.post(
        "/api/v1/auth/login",
        {"username": "viewer_one", "password": "a-whole-new-phrase", "app": "client"},
        format="json",
    )
    assert login.status_code == 200


def test_password_reset_never_reveals_accounts(api, user, mock_mode):
    unknown = api.post(
        "/api/v1/auth/password-reset/start", {"identifier": "nobody_here"}, format="json"
    )
    no_contact = api.post(
        "/api/v1/auth/password-reset/start", {"identifier": "viewer_one"}, format="json"
    )
    assert unknown.status_code == no_contact.status_code == 200
    assert unknown.json()["message"] == no_contact.json()["message"]
    assert len(unknown.json()["reset_token"]) == len(no_contact.json()["reset_token"])
    attempt = api.post(
        "/api/v1/auth/password-reset/confirm",
        {
            "reset_token": unknown.json()["reset_token"],
            "code": "123456",
            "new_password": "whatever-123",
        },
        format="json",
    )
    assert attempt.status_code == 400 and attempt.json()["code"] == "invalid_code"


# -- Studio ------------------------------------------------------------------------------------
def test_studio_test_buttons_and_outbox(staff_api, content_manager_api, beem):
    beem.get(
        "https://apisms.beem.africa/public/v1/vendors/balance",
        json={"data": {"credit_balance": 1520}},
    )
    balance = staff_api.get("/api/v1/admin/sms/balance").json()
    assert balance == {"ok": True, "message": "Beem balance: 1,520 SMS credits."}
    assert content_manager_api.get("/api/v1/admin/sms/balance").status_code == 403
    assert staff_api.get("/api/v1/admin/testing/outbox?kind=sms&to=0712000111").status_code == 404
    config.set("testing.mock_providers", True)
    assert staff_api.post("/api/v1/admin/sms/test", {"to": "0712000111"}, format="json").json()[
        "ok"
    ]
    assert staff_api.post(
        "/api/v1/admin/email/test", {"to": "ops@example.com"}, format="json"
    ).json()["ok"]
    box = staff_api.get("/api/v1/admin/testing/outbox?kind=sms&to=0712000111").json()
    assert "test SMS" in box[0]["body"]
    config.set("testing.mock_providers", False)
