"""Email over the SMTP server configured in Studio → Settings → Email."""

from __future__ import annotations

import smtplib
from email.utils import formataddr

from django.core.mail import EmailMessage, get_connection

from apps.core.config import config

from . import outbox
from .errors import MessagingError

SMTP_BACKEND = "django.core.mail.backends.smtp.EmailBackend"


def configured() -> bool:
    return bool(config.get_str("email.smtp_host") and config.get_str("email.from_email"))


def send(to: str, subject: str, body: str) -> str:
    """Send one plain-text email; returns a reference. Raises MessagingError."""
    if outbox.enabled():
        return outbox.push("email", to, body, subject)
    if not configured():
        raise MessagingError("Email isn't set up yet (Settings → Email).", "not_configured")
    port = config.get_int("email.smtp_port", 587)
    connection = get_connection(
        SMTP_BACKEND,
        host=config.get_str("email.smtp_host"),
        port=port,
        username=config.get_str("email.smtp_username") or None,
        password=config.get_secret("email.smtp_password") or None,
        use_ssl=port == 465,
        use_tls=port != 465 and config.get_bool("email.use_tls", True),
        timeout=10,
        fail_silently=False,
    )
    sender = formataddr((config.get_str("email.from_name", ""), config.get_str("email.from_email")))
    try:
        EmailMessage(subject, body, sender, [to], connection=connection).send()
    except smtplib.SMTPAuthenticationError as exc:
        raise MessagingError("The SMTP server rejected the username or password.") from exc
    except smtplib.SMTPRecipientsRefused as exc:
        raise MessagingError("The SMTP server refused that address.", "bad_recipient") from exc
    except (smtplib.SMTPException, OSError, TimeoutError) as exc:
        raise MessagingError(f"Couldn't send the email ({type(exc).__name__}).") from exc
    return "smtp"
