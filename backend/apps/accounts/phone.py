"""Phone numbers: E.164 digits without "+" (e.g. 255712345678), Tanzania first.

Accepts what people type — 0712 345 678, 712345678, +255 712 345 678, 255712345678 —
and returns the canonical digits, or raises ValueError. The mobile-money network is
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


def normalize(raw: str, country: str = DEFAULT_COUNTRY) -> str:
    """Canonical E.164 digits (no "+"). Raises ValueError with a human message."""
    if not isinstance(raw, str):
        raise ValueError("Enter a phone number.")
    text = raw.strip()
    if not text:
        raise ValueError("Enter a phone number.")
    if re.search(r"[^\d\s()+.\-]", text):
        raise ValueError("Use digits only.")
    digits = re.sub(r"\D", "", text)
    if text.startswith("+") or text.startswith("00"):
        digits = digits[2:] if text.startswith("00") else digits
    elif country == "255" and digits.startswith("0") and len(digits) == 10:
        digits = "255" + digits[1:]
    elif country == "255" and len(digits) == 9 and digits[0] in "67":
        digits = "255" + digits
    elif not digits.startswith(country):
        digits = country + digits.lstrip("0")
    if digits.startswith("255"):
        if not re.fullmatch(r"255[67]\d{8}", digits):
            raise ValueError("Enter a Tanzanian mobile number like 0712 345 678.")
        return digits
    if not any(digits.startswith(c) for c in COUNTRY_CODES) or not 8 <= len(digits) <= 15:
        raise ValueError("Enter a valid mobile number with its country code.")
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
