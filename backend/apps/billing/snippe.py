"""Snippe mobile-money API (https://docs.snippe.sh, api version 2026-01-25).

* `Authorization: Bearer snp_…`, `Idempotency-Key` (≤ 30 chars, unique per attempt; Snippe answers
  422 if a key is reused with a different body).
* Payments: POST /v1/payments (push / USSD to the phone) → 201 data.reference / status /
  expires_at; GET /v1/payments/{reference}; GET /v1/payments?limit&offset.
* Statuses: pending | completed | failed | voided | expired.
* 5xx and PAY_001 are retried with exponential backoff (the idempotency key makes that safe);
  429 honours X-Ratelimit-Reset when it's short.

In test mode (`testing.mock_providers`) nothing leaves the server: payments get a `mock_…`
reference and stay pending until a (signed) webhook or Studio's simulator settles them.
"""

from __future__ import annotations

import logging
import secrets
import time
from dataclasses import dataclass

import requests

from apps.core.config import config
from apps.messaging import outbox

log = logging.getLogger(__name__)
TIMEOUT = 15
RETRIES = 3
STATUSES = {"pending", "completed", "failed", "voided", "expired"}


class SnippeError(Exception):
    def __init__(self, message: str, code: str = "provider_error", *, retryable: bool = False):
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class SnippePayment:
    reference: str
    status: str
    expires_at: str | None
    raw: dict


def new_idempotency_key() -> str:
    return f"nf{secrets.token_hex(12)}"  # 26 chars


def _base() -> str:
    return config.get_str("payments.snippe_base_url", "https://api.snippe.sh").rstrip("/")


def _headers(idempotency_key: str | None = None) -> dict[str, str]:
    key = config.get_secret("payments.snippe_api_key")
    if not key:
        raise SnippeError("Payments aren't set up yet (Settings → Payments).", "not_configured")
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


def _payload(response: requests.Response) -> dict:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _error(response: requests.Response, body: dict) -> SnippeError:
    err = body.get("error")
    nested = err.get("code") if isinstance(err, dict) else err if isinstance(err, str) else None
    code = str(body.get("code") or nested or "")
    status = response.status_code
    log.warning("snippe request failed: status=%s code=%s", status, code)
    if status == 401:
        return SnippeError("Snippe rejected the API key.", "unauthorized")
    if status == 400:
        return SnippeError("Snippe couldn't accept that payment request.", "validation_error")
    if status == 409 or status == 422:
        return SnippeError("This payment request conflicts with an earlier one.", "conflict")
    if status == 429:
        return SnippeError(
            "Snippe is busy. Please try again shortly.", "rate_limited", retryable=True
        )
    if status >= 500 or code == "PAY_001":
        return SnippeError(
            "Snippe is having trouble. Please try again.", "unavailable", retryable=True
        )
    return SnippeError(f"Snippe returned {status}.", "provider_error")


def _request(method: str, path: str, *, idempotency_key: str | None = None, json=None) -> dict:
    url = f"{_base()}{path}"
    delay = 0.5
    for attempt in range(1, RETRIES + 1):
        try:
            response = requests.request(
                method, url, headers=_headers(idempotency_key), json=json, timeout=TIMEOUT
            )
        except requests.RequestException as exc:
            log.warning("snippe unreachable: %s (attempt %s)", type(exc).__name__, attempt)
            if attempt == RETRIES:
                raise SnippeError(
                    "Couldn't reach Snippe. Please try again.", "unavailable", retryable=True
                ) from exc
            time.sleep(delay)
            delay *= 2
            continue
        body = _payload(response)
        if response.ok and not str(body.get("code", "")).startswith("PAY_"):
            return body
        error = _error(response, body)
        if not error.retryable or attempt == RETRIES:
            raise error
        wait = delay
        if response.status_code == 429:
            reset = response.headers.get("X-Ratelimit-Reset", "")
            try:
                wait = float(reset)
                # Either "seconds from now" or an epoch timestamp.
                wait = wait - time.time() if wait > 1e9 else wait
            except ValueError:
                wait = delay
            if wait > 5:
                raise error
        time.sleep(max(0.0, wait))
        delay *= 2
    raise SnippeError("Snippe is having trouble. Please try again.", "unavailable", retryable=True)


def _parse(body: dict) -> SnippePayment:
    data = body.get("data") if isinstance(body.get("data"), dict) else body
    reference = str(data.get("reference") or "")
    status = str(data.get("status") or "pending").lower()
    if not reference or status not in STATUSES:
        raise SnippeError("Snippe sent an unexpected answer.", "provider_error")
    return SnippePayment(reference, status, data.get("expires_at"), data)


def create_payment(
    *,
    amount: int,
    phone: str,
    customer: dict,
    metadata: dict,
    idempotency_key: str,
    webhook_url: str,
) -> SnippePayment:
    if outbox.enabled():
        reference = f"mock_{secrets.token_hex(8)}"
        return SnippePayment(reference, "pending", None, {"reference": reference, "mock": True})
    body = {
        "payment_type": "mobile",
        "details": {"amount": int(amount), "currency": config.get_str("payments.currency", "TZS")},
        "phone_number": phone,
        "customer": {k: v for k, v in customer.items() if v},
        "metadata": metadata,
    }
    if webhook_url:
        body["webhook_url"] = webhook_url
    return _parse(_request("POST", "/v1/payments", idempotency_key=idempotency_key, json=body))


def get_payment(reference: str) -> SnippePayment | None:
    """Current status at Snippe (None in test mode: our own record is the truth there)."""
    if outbox.enabled() or reference.startswith("mock_"):
        return None
    return _parse(_request("GET", f"/v1/payments/{reference}"))


def test_connection() -> str:
    """Studio → Test API key: list one payment."""
    if outbox.enabled():
        return "Test mode is on: Snippe isn't called."
    body = _request("GET", "/v1/payments?limit=1&offset=0")
    data = body.get("data")
    count = len(data) if isinstance(data, list) else len((data or {}).get("items", []) or [])
    return (
        f"Snippe accepted the API key ({count} recent payment{'s' if count != 1 else ''} visible)."
    )
