from django.apps import AppConfig


class CatalogConfig(AppConfig):
    name = "apps.catalog"
    label = "catalog"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from . import signals  # noqa: F401
