"""Move branding to the new default palette and typeface — but only for rows an operator
never changed (they still hold the previous defaults)."""

from django.db import migrations

OLD_TO_NEW = {
    "branding.accent_color": ("#FF2E4D", "#E50914"),
    "branding.background_color": ("#0B0B0F", "#141414"),
    "branding.surface_color": ("#16161D", "#181818"),
    "branding.text_color": ("#F4F4F6", "#FFFFFF"),
    "branding.font_family": ("Inter", "Inter Tight"),
}
FONT_CHOICES = [
    "Inter Tight",
    "Inter",
    "Roboto",
    "Manrope",
    "Outfit",
    "Plus Jakarta Sans",
    "DM Sans",
]


def forwards(apps, schema_editor):
    ConfigEntry = apps.get_model("core", "ConfigEntry")
    for key, (old, new) in OLD_TO_NEW.items():
        for entry in ConfigEntry.objects.filter(key=key):
            if isinstance(entry.value, str) and entry.value.lower() == old.lower():
                entry.value = new
                entry.save(update_fields=["value"])
    for entry in ConfigEntry.objects.filter(key="branding.font_family"):
        entry.validation = {"choices": FONT_CHOICES}
        entry.save(update_fields=["validation"])


def backwards(apps, schema_editor):
    ConfigEntry = apps.get_model("core", "ConfigEntry")
    for key, (old, new) in OLD_TO_NEW.items():
        for entry in ConfigEntry.objects.filter(key=key):
            if isinstance(entry.value, str) and entry.value.lower() == new.lower():
                entry.value = old
                entry.save(update_fields=["value"])


class Migration(migrations.Migration):
    dependencies = [("core", "0001_initial")]
    operations = [migrations.RunPython(forwards, backwards)]
