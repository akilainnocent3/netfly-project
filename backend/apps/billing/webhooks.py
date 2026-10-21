"""POST /api/v1/payments/webhook/snippe — Snippe's payment events.

Verified (HMAC of "{X-Webhook-Timestamp}.{raw body}", constant-time, ≤ 5 minutes old), stored in
PaymentEvent, de-duplicated by event id, answered "OK" at once and processed by Celery.
Snippe retries after 3, 6, 12 and 24 minutes until it gets a 2xx.
"""

from __future__ import annotations

import json
import logging

from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from apps.core.config import config

from .models import PaymentEvent
from .payments import verify_signature

log = logging.getLogger(__name__)
MAX_BODY = 64 * 1024


@method_decorator(csrf_exempt, name="dispatch")
class SnippeWebhookView(View):
    http_method_names = ["post"]

    def post(self, request):
        raw = request.body
        if len(raw) > MAX_BODY:
            return HttpResponse("Too large", status=413)
        valid = verify_signature(
            config.get_secret("payments.snippe_webhook_secret"),
            request.headers.get("X-Webhook-Timestamp", ""),
            raw,
            request.headers.get("X-Webhook-Signature", ""),
        )
        try:
            payload = json.loads(raw or b"{}")
        except ValueError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        event_id = str(payload.get("id") or "")[:100] or None
        if not valid:
            log.warning("snippe webhook rejected: bad or stale signature")
            PaymentEvent.objects.create(
                type=str(payload.get("type") or "")[:40],
                reference=str(data.get("reference") or "")[:80],
                payload={"rejected": True},
                signature_valid=False,
                error="invalid signature",
            )
            return HttpResponse("Invalid signature", status=401)
        try:
            with transaction.atomic():
                event = PaymentEvent.objects.create(
                    event_id=event_id,
                    type=str(payload.get("type") or "")[:40],
                    reference=str(data.get("reference") or "")[:80],
                    payload=payload,
                    signature_valid=True,
                )
        except IntegrityError:
            return HttpResponse("OK")  # a retry of an event we already have
        from .tasks import process_payment_event

        transaction.on_commit(lambda: process_payment_event.delay(event.pk))
        return HttpResponse("OK")
