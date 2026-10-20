from celery import shared_task


@shared_task
def flush_view_events() -> int:
    from .tracking import flush_buffer

    total = 0
    while True:
        n = flush_buffer()
        total += n
        if n < 5000:
            return total
