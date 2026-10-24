"""Split `content.badge_days` into one window per badge.

An operator who changed the old shared window keeps that window on every badge; an install
still on the old default (14 days) gets the new defaults (Recently added and New episodes for
7 days, Leaving soon 14 days before the licence ends). The old key stays one more release and
is only read as a fallback (apps/catalog/badges.py).
"""

from django.db import migrations

OLD_KEY, OLD_DEFAULT = "content.badge_days", 14
NEW = {
    # key: (default, days → value, min, max, unit)
    "content.recently_added_hours": (168, lambda d: d * 24, 1, 2160, "hours"),
    "content.new_episodes_hours": (168, lambda d: d * 24, 1, 2160, "hours"),
    "content.leaving_soon_days": (14, lambda d: d, 1, 90, "days"),
}


def forwards(apps, schema_editor):
    ConfigEntry = apps.get_model("core", "ConfigEntry")
    old = ConfigEntry.objects.filter(key=OLD_KEY).first()
    if old is None:
        return  # a fresh database: seed_config creates the keys with their defaults
    days = old.value if isinstance(old.value, int) else OLD_DEFAULT
    customised = days != OLD_DEFAULT
    for key, (default, convert, low, high, unit) in NEW.items():
        if ConfigEntry.objects.filter(key=key).exists():
            continue
        value = min(high, max(low, convert(days))) if customised else default
        ConfigEntry.objects.create(
            key=key,
            group_id=old.group_id,
            value_type="int",
            value=value,
            is_public=True,
            unit=unit,
            validation={"min": low, "max": high},
        )


def backwards(apps, schema_editor):
    apps.get_model("core", "ConfigEntry").objects.filter(key__in=list(NEW)).delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0003_remove_autosubmit_delay")]
    operations = [migrations.RunPython(forwards, backwards)]
