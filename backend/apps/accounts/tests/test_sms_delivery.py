"""Phone codes: number normalisation, provider failures that are visible (never silent), sends.

Every number here is fake; Beem is mocked with `responses` (no real SMS is ever sent).
"""

import json
import logging
import re

import pytest
import responses

from apps.accounts import phone as phones
from apps.accounts.models import VerificationCode
from apps.core.config import config
from apps.core.models import AuditLog
from apps.messaging import outbox
from apps.messaging.sms import gsm_safe

pytestmark = pytest.mark.django_db
BEEM_SEND = "https://apisms.beem.africa/v1/send"
OK = {
    "successful": True,
    "request_id": 77,
    "code": 100,
    "message": "Message Submitted Successfully",
    "valid": 1,
    "invalid": 0,
    "duplicates": 0,
}


@pytest.fixture
def beem():
    config.set("testing.mock_providers", False)
    config.set("sms.api_key", "key-123")
    config.set("sms.secret_key", "secret-456")
    config.set("sms.sender_id", "NETFLY")
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        yield rsps


def start(api, value, channel="phone"):
    return api.post(f"/api/v1/auth/verify/{channel}/start", {"value": value}, format="json")


# -- normalisation --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "typed",
    [
        "0712 345 678",
        "0712345678",
        "712345678",
        "+255 712 345 678",
        "255712345678",
        "00255712345678",
        "(0712) 345-678",
    ],
)
def test_local_formats_become_e164(typed):
    assert phones.normalize(typed) == "255712345678"


@pytest.mark.parametrize(
    ("typed", "message"),
    [
        ("", "Enter a phone number."),
        ("0712abc678", "Use digits only."),
        ("0812 345 678", "Tanzanian mobile"),  # not a mobile range
        ("071234", "Tanzanian mobile"),  # too short
        ("+33 6 12 34 56 78", "aren't supported"),  # valid, but not a country we serve
    ],
)
def test_invalid_numbers_are_rejected(typed, message):
    with pytest.raises(ValueError, match=message):
        phones.normalize(typed)


def test_default_region_is_config():
    assert phones.normalize("+254 712 345 678") == "254712345678"
    config.set("sms.default_region", "KE")
    assert phones.normalize("0712 345 678") == "254712345678"  # read as Kenyan now


# -- provider errors are visible ------------------------------------------------------------
@pytest.mark.parametrize(
    ("status", "body", "reason"),
    [
        (400, {"successful": False, "code": 111, "message": "Invalid Sender ID"}, "sender ID"),
        (400, {"successful": False, "code": 102, "message": "Insufficient balance"}, "credit"),
        (
            401,
            {"successful": False, "code": 120, "message": "Invalid Authentication Parameters"},
            "API key",
        ),
        (200, {**OK, "valid": 0, "invalid": 1}, "sent nothing"),
        (200, {**OK, "valid": 0, "opted_out": 1}, "opted out"),
    ],
)
def test_provider_errors_give_a_clear_error_and_an_audit_trail(
    auth_api, beem, caplog, status, body, reason
):
    beem.post(BEEM_SEND, json=body, status=status)
    with caplog.at_level(logging.INFO):
        res = start(auth_api, "0712 000 111")
    assert res.status_code == 502
    assert res.json()["code"] == "send_failed"
    assert res.json()["message"] == (
        "We couldn't send a text to this number. Check the number or use email."
    )
    assert not VerificationCode.objects.exists()  # nothing to type in
    log = AuditLog.objects.get(action="verification.phone_send_failed")
    assert reason in log.changes["reason"]
    assert log.changes["provider"]["code"] == body["code"]
    assert log.changes["to"] == "0712 ••• 111"  # masked, never the full number
    sent = json.loads(beem.calls[0].request.body)["message"]
    code = re.search(r"#(\d{6})$", sent).group(1)
    assert code not in caplog.text and "secret-456" not in caplog.text
    assert str(body["code"]) in caplog.text  # the provider's answer is in the server log


def test_a_failed_send_does_not_use_up_the_hourly_cap(auth_api, beem):
    config.set("sms.max_sends_per_phone_per_hour", 1)
    beem.post(BEEM_SEND, json={"successful": False, "code": 111}, status=400)
    assert start(auth_api, "0712 000 222").status_code == 502
    beem.replace(responses.POST, BEEM_SEND, json=OK)
    assert start(auth_api, "0712 000 222").status_code == 201


def test_unreachable_provider(auth_api, beem):
    import requests

    beem.post(BEEM_SEND, body=requests.ConnectionError("down"))
    res = start(auth_api, "0712 000 333")
    assert res.status_code == 502 and "Check the number or use email" in res.json()["message"]
    assert AuditLog.objects.get(action="verification.phone_send_failed").changes["provider"] == {
        "error": "ConnectionError"
    }


# -- the success path -------------------------------------------------------------------------
def test_success_sends_exactly_once(auth_api, beem):
    beem.post(BEEM_SEND, json=OK)
    res = start(auth_api, "0712 000 444")
    assert res.status_code == 201 and res.json()["sent_to"] == "0712 ••• 444"
    assert len(beem.calls) == 1
    body = json.loads(beem.calls[0].request.body)
    assert body["recipients"] == [{"recipient_id": 1, "dest_addr": "255712000444"}]
    row = VerificationCode.objects.get()
    code = re.search(r"#(\d{6})$", body["message"]).group(1)
    assert row.code_hash and code not in row.code_hash  # stored hashed only
    confirm = auth_api.post("/api/v1/auth/verify/phone/confirm", {"code": code}, format="json")
    assert confirm.status_code == 200
    again = auth_api.post("/api/v1/auth/verify/phone/confirm", {"code": code}, format="json")
    assert again.status_code == 400  # single-use


def test_resend_cooldown_and_attempt_limit(auth_api, beem):
    beem.post(BEEM_SEND, json=OK)
    config.set("sms.otp_max_attempts", 2)
    assert start(auth_api, "0712 000 555").status_code == 201
    cooldown = start(auth_api, "0712 000 555")
    assert cooldown.status_code == 429 and cooldown.json()["code"] == "resend_cooldown"
    assert len(beem.calls) == 1  # the cooldown is checked before calling Beem
    wrong = lambda: auth_api.post(  # noqa: E731
        "/api/v1/auth/verify/phone/confirm", {"code": "000000"}, format="json"
    )
    assert wrong().json()["code"] == "invalid_code"
    assert wrong().json()["code"] == "invalid_code"
    assert wrong().json()["code"] == "too_many_attempts"


def test_template_is_made_gsm_safe(auth_api, beem):
    config.set("sms.otp_template", "“{code}” – your {site_name} code…\n\n@{domain} #{code}")
    beem.post(BEEM_SEND, json=OK)
    assert start(auth_api, "0712 000 666").status_code == 201
    sent = json.loads(beem.calls[0].request.body)["message"]
    assert sent.startswith('"') and " - your " in sent and "..." in sent
    assert gsm_safe("Habari 😀 ✓") == "Habari  "


def test_email_codes_still_work(auth_api):
    config.set("testing.mock_providers", True)
    res = start(auth_api, "viewer@example.com", channel="email")
    assert res.status_code == 201
    assert outbox.read("email", "viewer@example.com")
    config.set("testing.mock_providers", False)


# -- Studio's test button -------------------------------------------------------------------
def test_studio_test_sms_shows_the_raw_provider_answer(staff_api, content_manager_api, beem):
    beem.post(
        BEEM_SEND,
        json={"successful": False, "code": 111, "message": "Invalid Sender ID"},
        status=400,
    )
    failed = staff_api.post("/api/v1/admin/sms/test", {"to": "0712 000 777"}, format="json").json()
    assert failed["ok"] is False and "sender ID" in failed["message"]
    assert failed["provider"] == {
        "successful": False,
        "code": 111,
        "message": "Invalid Sender ID",
        "http_status": 400,
    }
    assert failed["to"] == "+255712000777"
    beem.replace(responses.POST, BEEM_SEND, json=OK)
    ok = staff_api.post("/api/v1/admin/sms/test", {"to": "0712 000 777"}, format="json").json()
    assert ok["ok"] is True and ok["provider"]["valid"] == 1 and "request 77" in ok["message"]
    # The typed number is used once and kept nowhere but the (masked) audit entry.
    assert not VerificationCode.objects.exists()
    assert AuditLog.objects.get(action="sms.test").changes["to"] == "0712 ••• 777"
    assert (
        content_manager_api.post("/api/v1/admin/sms/test", {"to": "0712 000 777"}).status_code
        == 403
    )
