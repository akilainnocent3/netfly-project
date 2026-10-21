from celery import shared_task


@shared_task
def purge_usage_keys() -> int:
    """Drop Redis counters of finished windows (the ledger keeps the history)."""
    from .usage import purge_stale_keys

    return purge_stale_keys()
