"""Catalog writes that change recommendations bump the global catalog version.

Signals (rather than admin-view hooks) catch every write path: the Studio API, bulk actions,
scheduled publishing, license expiry, transcode completion and the seed command.
"""

from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from apps.catalog.models import (
    Billboard,
    Collection,
    CollectionItem,
    Genre,
    HomeRow,
    RelatedTitle,
    Title,
)

from .cache import bump_catalog_on_commit

TITLE_FIELDS = {
    "status",
    "is_featured",
    "boost",
    "boost_starts_at",
    "boost_ends_at",
    "published_at",
    "publish_at",
    "translation_status",
    "type",
    "license_end",
}


@receiver(post_save, sender=Title)
def title_saved(sender, instance, created, update_fields=None, **kwargs):
    if created or update_fields is None or TITLE_FIELDS & set(update_fields):
        bump_catalog_on_commit()


@receiver(m2m_changed, sender=Title.genres.through)
def title_genres_changed(sender, action, **kwargs):
    if action in ("post_add", "post_remove", "post_clear"):
        bump_catalog_on_commit()


@receiver([post_save, post_delete], sender=RelatedTitle)
@receiver([post_save, post_delete], sender=Collection)
@receiver([post_save, post_delete], sender=CollectionItem)
@receiver([post_save, post_delete], sender=HomeRow)
@receiver([post_save, post_delete], sender=Billboard)
@receiver([post_save, post_delete], sender=Genre)
@receiver(post_delete, sender=Title)
def catalog_changed(sender, **kwargs):
    bump_catalog_on_commit()
