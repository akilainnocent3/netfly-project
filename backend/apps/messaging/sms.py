"""Beem Africa SMS (https://docs.beem.africa): sending, balance, and the optional OTP API.

Credentials are `sms.api_key` / `sms.secret_key` (HTTP Basic). Message bodies can hold codes, so
they are never logged; errors carry Beem's code and a safe description only.
"""

from __future__ import annotations

import logging

import requests

from apps.core.config import config

from . import outbox
from .errors import MessagingError

log = logging.getLogger(__name__)
TIMEOUT = 10

# Beem SMS response codes worth explaining to an operator.
BEEM_ERRORS = {
    101: "Invalid message parameters.",
    102: "Invalid recipient number.",
    111: "Invalid sender ID (check Settings → SMS → Sender ID is approved by Beem).",
    114: "Not enough SMS credit on the Beem account.",
    120: "Beem rejected the API key / secret key.",
}


def _auth() -> tuple[str, str]:
    key, secret = config.get_secret("sms.api_key"), config.get_secret("sms.secret_key")
    if not (key and secret):
        raise MessagingError("SMS isn't set up yet (Settings → SMS).", "not_configured")
    return key, secret


def _json(response: requests.Response) -> dict:
    try:
        data = response.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _inner(data: dict) -> tuple[dict, dict]:
    """Beem OTP nests results as {"data": {"pinId", "message": {"code", "message"}}}."""
    inner = data.get("data") if isinstance(data.get("data"), dict) else {}
    message = inner.get("message") if isinstance(inner.get("message"), dict) else {}
    return inner, message


def _fail(where: str, response: requests.Response | None, data: dict) -> MessagingError:
    code = data.get("code") or _inner(data)[1].get("code")
    status = response.status_code if response is not None else None
    log.warning("beem %s failed: status=%s code=%s", where, status, code)
    if status in (401, 403):
        code = 120
    detail = BEEM_ERRORS.get(code) if isinstance(code, int) else None
    return MessagingError(
        detail or f"Beem couldn't {where} (code {code or status}).",
        "bad_auth" if code == 120 else "send_failed",
    )


def send(dest: str, message: str) -> str:
    """Send one SMS to canonical digits (2557…); returns Beem's request_id."""
    if outbox.enabled():
        return outbox.push("sms", dest, message)
    auth = _auth()
    url = f"{config.get_str('sms.base_url', 'https://apisms.beem.africa').rstrip('/')}/v1/send"
    body = {
        "source_addr": config.get_str("sms.sender_id", "NETFLY")[:11],
        "schedule_time": "",
        "encoding": 0,
        "message": message,
        "recipients": [{"recipient_id": 1, "dest_addr": dest}],
    }
    try:
        response = requests.post(url, json=body, auth=auth, timeout=TIMEOUT)
    except requests.RequestException as exc:
        log.warning("beem send unreachable: %s", type(exc).__name__)
        raise MessagingError("Couldn't reach Beem. Try again shortly.") from exc
    data = _json(response)
    if response.ok and data.get("successful") is True and data.get("code") == 100:
        return str(data.get("request_id", ""))
    raise _fail("send the SMS", response, data)


def balance() -> float:
    """Remaining SMS credit on the Beem vendor account."""
    if outbox.enabled():
        return 9999.0
    auth = _auth()
    base = config.get_str("sms.base_url", "https://apisms.beem.africa").rstrip("/")
    try:
        response = requests.get(f"{base}/public/v1/vendors/balance", auth=auth, timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise MessagingError("Couldn't reach Beem. Try again shortly.") from exc
    data = _json(response)
    credit = _inner(data)[0].get("credit_balance")
    if response.ok and credit is not None:
        return float(credit)
    raise _fail("read the balance", response, data)


# -- Beem OTP API (sms.otp_provider = beem_otp) -------------------------------------------
def _otp_url(path: str) -> str:
    base = config.get_str("sms.beem_otp_base_url", "https://apiotp.beem.africa").rstrip("/")
    return f"{base}/v1/{path}"


def otp_request(msisdn: str) -> str:
    """Ask Beem to generate and send a PIN; returns its pinId."""
    if outbox.enabled():
        return outbox.push("sms", msisdn, "(Beem OTP) PIN 123456")
    auth = _auth()
    app_id = config.get_str("sms.beem_otp_app_id")
    if not app_id:
        raise MessagingError("Set the Beem OTP app id (Settings → SMS).", "not_configured")
    try:
        response = requests.post(
            _otp_url("request"),
            json={"appId": int(app_id) if app_id.isdigit() else app_id, "msisdn": msisdn},
            auth=auth,
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        raise MessagingError("Couldn't reach Beem. Try again shortly.") from exc
    data = _json(response)
    inner, message = _inner(data)
    if response.ok and message.get("code") == 100 and inner.get("pinId"):
        return str(inner["pinId"])
    raise _fail("send the code", response, data)


def otp_verify(pin_id: str, pin: str) -> bool:
    """True when Beem says the PIN is valid (code 117)."""
    if outbox.enabled():
        return pin == "123456"
    auth = _auth()
    try:
        response = requests.post(
            _otp_url("verify"), json={"pinId": pin_id, "pin": pin}, auth=auth, timeout=TIMEOUT
        )
    except requests.RequestException as exc:
        raise MessagingError("Couldn't reach Beem. Try again shortly.") from exc
    return response.ok and _inner(_json(response))[1].get("code") == 117
