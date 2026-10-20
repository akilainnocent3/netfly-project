import pytest
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APIClient


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        call_command("seed_config", verbosity=0)
        from apps.core.models import ConfigEntry

        entry = ConfigEntry.objects.get(key="security.allowed_hosts")
        entry.value = sorted({*entry.value, "testserver"})
        entry.save()


@pytest.fixture(autouse=True)
def _clean_cache():
    from apps.core.config import config

    cache.clear()
    config.invalidate()
    yield
    cache.clear()


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def user(db):
    from apps.accounts.models import User

    return User.objects.create_user("viewer_one", "correct-horse", full_name="Viewer One")


@pytest.fixture
def staff(db):
    from apps.accounts.models import User

    return User.objects.create_superuser("boss", "correct-horse", full_name="The Boss")


@pytest.fixture
def auth_api(api, user):
    from apps.accounts.tokens import issue_access_token

    api.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_access_token(user)[0]}")
    api.user = user
    return api


@pytest.fixture
def staff_api(staff):
    from apps.accounts.tokens import issue_access_token

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_access_token(staff)[0]}")
    client.user = staff
    return client
