from celery import shared_task


@shared_task
def purge_usage_keys() -> int:
    """Drop Redis counters of finished windows (the ledger keeps the history)."""
    from .usage import purge_stale_keys

    return purge_stale_keys()


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=300, max_retries=8)
def process_payment_event(event_pk: int) -> str:
    """A verified Snippe webhook: settle the payment (idempotent)."""
    from .payments import process_event

    return process_event(event_pk)


@shared_task
def reconcile_payments() -> int:
    """Every 2 minutes: poll Snippe for pending payments in case a webhook was lost."""
    from .payments import reconcile

    return reconcile()


@shared_task
def run_renewals() -> dict:
    """Reminders, renewal / trial-conversion pushes, retries, grace and downgrades."""
    from .renewals import run

    return run()
