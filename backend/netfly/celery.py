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
    "cleanup-refresh-tokens": {
        "task": "apps.accounts.tasks.cleanup_refresh_tokens",
        "schedule": 86400.0,
    },
}
