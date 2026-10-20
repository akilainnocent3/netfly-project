from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.config import config, encrypt
from apps.core.config_defaults import GROUPS, KEYS
from apps.core.models import ConfigEntry, ConfigGroup, LegalPage

LEGAL = {
    "terms": (
        "Terms of Service",
        "# Terms of Service\n\nEdit this page in the admin app under Settings → Legal pages.",
    ),
    "privacy": (
        "Privacy Policy",
        "# Privacy Policy\n\nEdit this page in the admin app under Settings → Legal pages.",
    ),
}


class Command(BaseCommand):
    help = "Create every configuration key with defaults. Existing values are kept."

    @transaction.atomic
    def handle(self, *args, **options):
        groups = {}
        for order, (key, name, description) in enumerate(GROUPS):
            groups[key], _ = ConfigGroup.objects.update_or_create(
                key=key, defaults={"name": name, "description": description, "order": order}
            )
        created = 0
        for order, spec in enumerate(KEYS):
            group = groups[spec.key.split(".", 1)[0]]
            meta = {
                "group": group,
                "label": spec.label,
                "value_type": spec.type,
                "is_secret": spec.type == "secret",
                "is_public": spec.public and spec.type != "secret",
                "description": spec.description,
                "unit": spec.unit,
                "validation": spec.validation,
                "order": order,
                "requires_restart": spec.restart,
            }
            entry = ConfigEntry.objects.filter(key=spec.key).first()
            if entry is None:
                ConfigEntry.objects.create(
                    key=spec.key,
                    value=None if spec.type == "secret" else spec.default,
                    encrypted_value=(
                        encrypt(spec.default) if spec.type == "secret" and spec.default else ""
                    ),
                    **meta,
                )
                created += 1
            else:
                for field, value in meta.items():
                    setattr(entry, field, value)
                entry.save()
        for slug, (title, body) in LEGAL.items():
            LegalPage.objects.get_or_create(
                slug=slug, defaults={"title": title, "body_markdown": body}
            )
        transaction.on_commit(config.invalidate)
        self.stdout.write(
            self.style.SUCCESS(f"Config seeded: {created} new keys, {len(KEYS)} total.")
        )
