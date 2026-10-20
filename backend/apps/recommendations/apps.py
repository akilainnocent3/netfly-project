from django.apps import AppConfig


class RecommendationsConfig(AppConfig):
    name = "apps.recommendations"
    label = "recommendations"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
