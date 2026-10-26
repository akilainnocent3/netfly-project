import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "netfly.settings")

app = Celery("netfly")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Periodic jobs. Their behaviour (thresholds, windows) is read from DB config
# inside each task, so schedules stay fixed and cheap.
app.conf.beat_schedule = {
    "publish-scheduled-titles": {
        "task": "apps.catalog.tasks.publish_scheduled_titles",
        "schedule": 60.0,
    },
    "enforce-licenses": {"task": "apps.catalog.tasks.enforce_licenses", "schedule": 3600.0},
    "flush-view-events": {"task": "apps.engagement.tasks.flush_view_events", "schedule": 10.0},
    "refresh-popularity": {
        "task": "apps.recommendations.tasks.refresh_popularity",
        "schedule": 600.0,
    },
    "purge-usage-keys": {"task": "apps.billing.tasks.purge_usage_keys", "schedule": 3600.0},
    "reconcile-payments": {"task": "apps.billing.tasks.reconcile_payments", "schedule": 120.0},
    "run-renewals": {"task": "apps.billing.tasks.run_renewals", "schedule": 300.0},
    "purge-extraction-jobs": {
        "task": "apps.extraction.tasks.purge_old_jobs",
        "schedule": 86400.0,
    },
    "cleanup-refresh-tokens": {
        "task": "apps.accounts.tasks.cleanup_refresh_tokens",
        "schedule": 86400.0,
    },
}
