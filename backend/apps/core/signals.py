from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .config import config
from .models import ConfigEntry


@receiver([post_save, post_delete], sender=ConfigEntry)
def invalidate_config(**_kwargs) -> None:
    config.invalidate()
