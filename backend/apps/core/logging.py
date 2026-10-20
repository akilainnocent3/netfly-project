import logging
import re

_PATTERNS = [
    re.compile(
        r"(?i)(password|secret|token|authorization|access_key|private_key)(\"?\s*[:=]\s*\"?)([^\s\",&]+)"
    ),
    re.compile(r"(?i)(X-Amz-Signature=|Signature=|sig=)([^&\s\"]+)"),
]


class RedactSecretsFilter(logging.Filter):
    """Last line of defence: scrub obvious secrets from any log line."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001
            return True
        redacted = message
        for pattern in _PATTERNS:
            redacted = pattern.sub(
                lambda m: m.group(1)
                + (m.group(2) if m.lastindex and m.lastindex >= 3 else "")
                + "[redacted]",
                redacted,
            )
        if redacted != message:
            record.msg, record.args = redacted, ()
        return True
