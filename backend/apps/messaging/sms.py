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

# Beem SMS response codes (https://docs.beem.africa/guides/sms/api-responses.md), explained for
# operators. 101 / 115 are about the number; the rest are account or configuration problems.
BEEM_ERRORS = {
    101: "Beem rejected the phone number.",
    102: "Not enough SMS credit on the Beem account (Settings → SMS → Check balance).",
    103: "Beem had a network timeout or internal error. Try again shortly.",
    104: "Beem says a required parameter is missing.",
    109: "Beem says the message is empty or invalid.",
    110: "The message has characters Beem can't send (check the SMS template).",
    111: "Beem rejected the sender ID: it isn't registered or isn't active on this account "
    "(Settings → SMS → Sender ID must match an approved ID in the Beem dashboard).",
    113: "Beem couldn't read the request.",
    115: "Beem says the destination number is missing.",
    118: "Beem says the encoding is missing.",
    120: "Beem rejected the API key / secret key.",
    121: "Beem says the sender ID format is invalid.",
}
NUMBER_CODES = {101, 115}

# GSM 03.38 basic set + extension table: anything else makes Beem answer 110 (encoding 0 is the
# only documented encoding). Common typographic characters are mapped to safe equivalents.
GSM_CHARS = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "ÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€"
)
GSM_REPLACEMENTS = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201a": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u201e": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2212": "-",
    "\u2026": "...",
    "\u00a0": " ",
    "\u2009": " ",
    "\u202f": " ",
    "\u2022": "*",
    "\u00b7": "*",
    "\t": " ",
}


def gsm_safe(text: str) -> str:
    """Text Beem's GSM encoding can carry: typographic quotes/dashes become ASCII, other
    characters outside GSM 03.38 are dropped (an SMS with them would be refused outright)."""
    out = "".join(GSM_REPLACEMENTS.get(ch, ch) for ch in text)
    return "".join(ch for ch in out if ch in GSM_CHARS)


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


def _provider(response: requests.Response | None, data: dict) -> dict:
    """What Beem answered, minus anything we sent (the body holds the code)."""
    keep = ("successful", "code", "message", "valid", "invalid", "duplicates", "opted_out")
    info = {k: data[k] for k in keep if k in data}
    inner, message = _inner(data)
    if message:
        info.setdefault("code", message.get("code"))
        info.setdefault("message", message.get("message"))
    if "error" in data:
        info["error"] = str(data["error"])[:200]
    if response is not None:
        info["http_status"] = response.status_code
    return info


def _fail(where: str, response: requests.Response | None, data: dict) -> MessagingError:
    provider = _provider(response, data)
    code = provider.get("code")
    status = response.status_code if response is not None else None
    log.warning("beem %s failed: %s", where, provider)
    if status in (401, 403):
        code = 120
    detail = BEEM_ERRORS.get(code) if isinstance(code, int) else None
    said = provider.get("message") or provider.get("error")
    return MessagingError(
        detail or f"Beem couldn't {where} (code {code or status}{f': {said}' if said else ''}).",
        "bad_auth" if code == 120 else "send_failed",
        provider=provider,
        rejected_number=code in NUMBER_CODES,
    )


def send(dest: str, message: str) -> str:
    """Send one SMS to canonical digits (2557…); returns Beem's request_id."""
    return send_with_response(dest, message)[0]


def send_with_response(dest: str, message: str) -> tuple[str, dict]:
    """`send`, plus what Beem answered (Studio's test button shows it)."""
    message = gsm_safe(message)
    if outbox.enabled():
        return outbox.push("sms", dest, message), {"test_mode": True}
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
        raise MessagingError(
            "Couldn't reach Beem. Try again shortly.",
            provider={"error": type(exc).__name__},
        ) from exc
    data = _json(response)
    if response.ok and data.get("successful") is True and data.get("code") == 100:
        provider = _provider(response, data)
        # "Submitted" can still mean nothing was sent: Beem counts rejected and opted-out
        # recipients instead of failing the request.
        if data.get("valid", 1) == 0 or data.get("invalid") or data.get("opted_out"):
            log.warning("beem send accepted but not delivered: %s", provider)
            reason = (
                "the number has opted out of SMS from this sender"
                if data.get("opted_out")
                else "Beem says the number isn't valid"
            )
            raise MessagingError(
                f"Beem accepted the request but sent nothing: {reason}.",
                provider=provider,
                rejected_number=True,
            )
        log.info("beem send ok: request_id=%s", data.get("request_id"))
        return str(data.get("request_id", "")), provider
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
