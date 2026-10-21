import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.accounts import phone
from apps.accounts.models import User
from apps.core.config import config

pytestmark = pytest.mark.django_db

PW = "correct-horse"


def login(api, identifier, password=PW, **extra):
    return api.post(
        "/api/v1/auth/login",
        {"username": identifier, "password": password, "app": "client", **extra},
        format="json",
    )


@pytest.fixture
def verified(db):
    return User.objects.create_user(
        "amina",
        PW,
        full_name="Amina",
        email="Amina@Example.com",
        email_verified_at=timezone.now(),
        phone="255712345678",
        phone_verified_at=timezone.now(),
    )


@pytest.mark.parametrize(
    "raw",
    [
        "0712345678",
        "712345678",
        "+255712345678",
        "255 712 345 678",
        "0712-345-678",
        "00255712345678",
    ],
)
def test_phone_normalisation(raw):
    assert phone.normalize(raw) == "255712345678"


@pytest.mark.parametrize(
    "raw", ["", "abc", "0812345678", "+2557123", "07123456789", "0712<script>"]
)
def test_phone_rejects_junk(raw):
    with pytest.raises(ValueError):
        phone.normalize(raw)


def test_network_detection_and_masking():
    assert phone.network("255754000000") == "vodacom"
    assert phone.network("255689000000") == "airtel"
    assert phone.network("255712000000") == "mixx"
    assert phone.network("255622000000") == "halotel"
    assert phone.network("254712000000") is None
    assert phone.masked("255712345678") == "0712 ••• 678"


@pytest.mark.parametrize("identifier", ["amina", "AMINA", "amina@example.com", "0712 345 678"])
def test_login_with_username_verified_email_or_phone(api, verified, identifier):
    res = login(api, identifier)
    assert res.status_code == 200, res.json()
    assert res.json()["user"]["username"] == "amina"
    assert res.json()["user"]["email_verified"] is True


def test_unverified_contact_details_never_sign_in(api):
    User.objects.create_user("bob", PW, email="bob@example.com", phone="255754111222")
    assert login(api, "bob@example.com").status_code == 400
    assert login(api, "0754111222").status_code == 400
    assert login(api, "bob").status_code == 200


def test_email_and_phone_are_unique(verified):
    with pytest.raises(IntegrityError):
        User.objects.create_user("copycat", PW, email="AMINA@example.com")


def test_phone_unique(verified):
    with pytest.raises(IntegrityError):
        User.objects.create_user("copycat2", PW, phone="255712345678")


def test_lockout_is_per_account_not_per_spelling(api, verified):
    config.set("auth.login_max_attempts", 3)
    config.set("security.rate_login", "100/min")
    for identifier in ["amina", "amina@example.com", "0712345678"]:
        login(api, identifier, "wrong-password")
    assert login(api, "amina").json()["code"] == "account_locked"


def test_remember_me_off_gives_session_cookies_that_stay_session(api, verified):
    res = login(api, "amina", remember=False)
    cookie = res.cookies["netfly_rt_client"]
    assert cookie["max-age"] == "" and cookie["expires"] == ""
    csrf = api.cookies["netfly_csrf_client"].value
    again = api.post(
        "/api/v1/auth/refresh", {"app": "client"}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert again.status_code == 200
    assert again.cookies["netfly_rt_client"]["max-age"] == ""
    remembered = login(api, "amina")
    assert int(remembered.cookies["netfly_rt_client"]["max-age"]) > 86400


def test_me_exposes_contact_state_read_only(api, verified):
    token = login(api, "amina").json()["access"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    me = api.patch(
        "/api/v1/auth/me", {"email": "x@evil.example", "phone": "0754000000"}, format="json"
    )
    assert me.status_code == 200
    verified.refresh_from_db()
    assert verified.email == "Amina@Example.com" and verified.phone == "255712345678"
