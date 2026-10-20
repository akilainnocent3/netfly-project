"""Forms no longer auto-submit (they submit on the button or Enter), so the delay setting is gone."""

from django.db import migrations


def forwards(apps, schema_editor):
    apps.get_model("core", "ConfigEntry").objects.filter(key="ux.autosubmit_delay_ms").delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0002_netflix_palette_defaults")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
