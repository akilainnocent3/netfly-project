import importlib

import pytest
from django.apps import apps as django_apps

from apps.core.models import ConfigEntry

pytestmark = pytest.mark.django_db
migration = importlib.import_module("apps.core.migrations.0002_netflix_palette_defaults")


def test_only_untouched_defaults_move_to_new_palette():
    ConfigEntry.objects.filter(key="branding.accent_color").update(value="#FF2E4D")  # old default
    ConfigEntry.objects.filter(key="branding.background_color").update(
        value="#123456"
    )  # operator choice
    migration.forwards(django_apps, None)
    assert ConfigEntry.objects.get(key="branding.accent_color").value == "#E50914"
    assert ConfigEntry.objects.get(key="branding.background_color").value == "#123456"
