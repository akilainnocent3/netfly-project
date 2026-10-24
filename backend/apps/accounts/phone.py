"""Phone numbers: E.164 digits without "+" (e.g. 255712345678), Tanzania first.

Accepts what people type — 0712 345 678, 712345678, +255 712 345 678, 255712345678 —
and returns the canonical digits, or raises ValueError. Parsing and validation use
`phonenumbers` (Google's libphonenumber metadata); a number without a country code is read in
`sms.default_region` (TZ by default). The mobile-money network is
detected from the Tanzanian prefix (number portability exists, so it's a default the
viewer can change, never a hard rule).
"""

from __future__ import annotations

import re

DEFAULT_COUNTRY = "255"
# Calling codes we accept (East Africa first). Mobile money payments are Tanzania only.
COUNTRY_CODES = ("255", "254", "256", "250", "257", "243", "260", "265", "258", "27", "1", "44")

# Tanzanian mobile prefixes (after 255) → network.
TZ_NETWORKS: dict[str, str] = {
    "74": "vodacom",
    "75": "vodacom",
    "76": "vodacom",
    "79": "vodacom",
    "68": "airtel",
    "69": "airtel",
    "78": "airtel",
    "65": "mixx",
    "67": "mixx",
    "71": "mixx",
    "77": "mixx",
    "61": "halotel",
    "62": "halotel",
}

NETWORK_LABELS = {
    "vodacom": "Vodacom M-Pesa",
    "airtel": "Airtel Money",
    "mixx": "Mixx by Yas",
    "halotel": "Halotel",
}


def default_region() -> str:
    """ISO country for numbers typed without a country code (`sms.default_region`)."""
    from apps.core.config import config

    return (config.get_str("sms.default_region", "TZ") or "TZ").upper()


def normalize(raw: str, region: str | None = None) -> str:
    """Canonical E.164 digits (no "+"), parsed and validated with `phonenumbers`.
    Numbers without a country code are read in `region` (default: `sms.default_region`).
    Raises ValueError with a human message."""
    import phonenumbers

    if not isinstance(raw, str):
        raise ValueError("Enter a phone number.")
    text = raw.strip()
    if not text:
        raise ValueError("Enter a phone number.")
    if re.search(r"[^\d\s()+.\-]", text):
        raise ValueError("Use digits only.")
    region = (region or default_region()).upper()
    if text.startswith("00"):
        text = "+" + text[2:]
    elif not text.startswith("+") and re.sub(r"\D", "", text).startswith(
        tuple(c for c in COUNTRY_CODES if len(re.sub(r"\D", "", text)) >= len(c) + 8)
    ):
        # Typed with the country code but no "+" (255712345678).
        text = "+" + re.sub(r"\D", "", text)
    local_hint = (
        "Enter a Tanzanian mobile number like 0712 345 678."
        if region == "TZ"
        else "Enter a valid mobile number with its country code."
    )
    try:
        number = phonenumbers.parse(text, region)
    except phonenumbers.NumberParseException as exc:
        raise ValueError(local_hint) from exc
    digits = phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)[1:]
    mobile = phonenumbers.number_type(number) in (
        phonenumbers.PhoneNumberType.MOBILE,
        phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE,
    )
    if not (phonenumbers.is_valid_number(number) and mobile):
        raise ValueError(
            "Enter a Tanzanian mobile number like 0712 345 678."
            if digits.startswith(DEFAULT_COUNTRY)
            else local_hint
        )
    if not any(digits.startswith(c) for c in COUNTRY_CODES):
        raise ValueError("Phone numbers from this country aren't supported yet.")
    return digits


def network(phone: str) -> str | None:
    """Mobile-money network for a canonical Tanzanian number, if known."""
    if not phone.startswith("255") or len(phone) != 12:
        return None
    return TZ_NETWORKS.get(phone[3:5])


def masked(phone: str) -> str:
    """0712 ••• 678 (local format for Tanzania), for screens and messages."""
    if phone.startswith("255") and len(phone) == 12:
        local = "0" + phone[3:]
        return f"{local[:4]} ••• {local[-3:]}"
    return f"+{phone[:-6]}•••{phone[-3:]}" if len(phone) > 6 else phone
