"""Titles that become public (or stop being public) are queued for IndexNow."""

from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from . import indexnow
from .models import Title


@receiver(pre_save, sender=Title)
def remember_status(sender, instance, update_fields=None, **kwargs):
    if instance.pk and (update_fields is None or "status" in update_fields):
        previous = Title.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
        instance._public_before = previous == Title.Status.PUBLISHED


@receiver(post_save, sender=Title)
def queue_indexnow(sender, instance, created, **kwargs):
    public = instance.status == Title.Status.PUBLISHED
    # Consumed here, so a later save that doesn't touch `status` can't reuse it.
    before = instance.__dict__.pop("_public_before", False if created else public)
    if public != before:
        slug = instance.slug
        transaction.on_commit(lambda: indexnow.queue(slug))
