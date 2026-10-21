from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=settings.AUTH_USER_MODEL, dispatch_uid="billing-free-subscription")
def give_new_accounts_the_free_plan(sender, instance, created, raw=False, **kwargs):
    """Every account starts on the default free plan (no email, phone or payment needed)."""
    if not created or raw:
        return
    from .plans import ensure_subscription

    ensure_subscription(instance)
