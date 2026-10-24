"""The mobile app's session: the web's rules (rotation, reuse detection, lockout, token_version)
with the refresh token in the body instead of an httpOnly cookie, scoped to app="mobile"."""

import datetime as dt

import pytest
from django.utils import timezone

from apps.accounts.models import RefreshToken
from apps.core.config import config

pytestmark = pytest.mark.django_db

UA = {"HTTP_USER_AGENT": "NETFLY/1.0 (Android 15; Pixel 7)"}


def signup(api, username="pocket_viewer", password="long-enough-pw", **extra):
    return api.post(
        "/api/v1/auth/mobile/signup",
        {"username": username, "full_name": "Pocket Viewer", "password": password},
        format="json",
        **(UA | extra),
    )


def login(api, username="viewer_one", password="correct-horse", **extra):
    return api.post(
        "/api/v1/auth/mobile/login",
        {"username": username, "password": password},
        format="json",
        **(UA | extra),
    )


def refresh(api, token, **extra):
    return api.post(
        "/api/v1/auth/mobile/refresh", {"refresh": token}, format="json", **(UA | extra)
    )


def test_signup_returns_the_refresh_token_in_the_body_and_sets_no_cookies(api):
    response = signup(api)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert set(body) == {"access", "expires_in", "refresh", "user"}
    assert body["user"]["username"] == "pocket_viewer"
    assert not response.cookies
    assert response["Cache-Control"] == "no-store"
    record = RefreshToken.objects.get()
    assert record.app == "mobile" and record.persistent
    assert record.token_hash != body["refresh"]  # stored hashed


def test_login_and_me_with_the_bearer_token(api, user):
    response = login(api, username="VIEWER_one")
    assert response.status_code == 200
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
    assert api.get("/api/v1/auth/me").json()["full_name"] == "Viewer One"


def test_wrong_password_is_generic(api, user):
    response = login(api, password="nope-nope")
    assert response.status_code == 400
    assert response.json() == {
        "code": "invalid_credentials",
        "message": "Wrong username or password.",
    }


def test_lockout_is_shared_with_the_web(api, user):
    config.set("auth.login_max_attempts", 3)
    config.set("security.rate_login", "100/min")
    for _ in range(2):
        login(api, password="bad-guess")
    api.post(
        "/api/v1/auth/login", {"username": "viewer_one", "password": "bad-guess"}, format="json"
    )
    locked = login(api)
    assert locked.status_code == 429 and locked.json()["code"] == "account_locked"


def test_login_rate_limit(api, user):
    config.set("security.rate_login", "2/min")
    codes = [login(api, username="x_user", password="whatever1").status_code for _ in range(3)]
    assert codes[-1] == 429


def test_refresh_rotates_and_a_replay_revokes_the_family(api):
    config.set("auth.refresh_reuse_grace_seconds", 0)  # strict: any reuse is theft
    old = signup(api).json()["refresh"]
    first = refresh(api, old)
    assert first.status_code == 200
    new = first.json()["refresh"]
    assert new != old
    replay = refresh(api, old)
    assert replay.status_code == 401
    assert replay.json() == {
        "code": "refresh_reused",
        "message": "Your session has ended. Please log in again.",
    }
    assert refresh(api, new).status_code == 401  # the stolen family is dead
    assert not RefreshToken.objects.filter(revoked_at__isnull=True).exists()


def test_a_lost_refresh_response_is_forgiven_for_the_same_device(api):
    old = signup(api).json()["refresh"]
    assert refresh(api, old).status_code == 200
    again = refresh(api, old)  # the answer never reached the phone
    assert again.status_code == 200
    assert not RefreshToken.objects.filter(revoked_at__isnull=False).exists()


def test_reuse_from_another_device_or_after_the_grace_window_revokes(api):
    old = signup(api).json()["refresh"]
    assert refresh(api, old).status_code == 200
    stolen = refresh(api, old, HTTP_USER_AGENT="Attacker/9")
    assert stolen.status_code == 401 and stolen.json()["code"] == "refresh_reused"

    old = signup(api, username="pocket_two").json()["refresh"]
    assert refresh(api, old).status_code == 200
    RefreshToken.objects.filter(used_at__isnull=False).update(
        used_at=timezone.now() - dt.timedelta(seconds=61)
    )
    late = refresh(api, old)
    assert late.status_code == 401 and late.json()["code"] == "refresh_reused"


def test_expired_and_unknown_tokens(api):
    token = signup(api).json()["refresh"]
    RefreshToken.objects.update(expires_at=timezone.now() - dt.timedelta(seconds=1))
    expired = refresh(api, token)
    assert expired.status_code == 401 and expired.json()["code"] == "refresh_expired"
    unknown = refresh(api, "not-a-token")
    assert unknown.status_code == 401 and unknown.json()["code"] == "invalid_refresh"


def test_logout_revokes(api):
    token = signup(api).json()["refresh"]
    response = api.post("/api/v1/auth/mobile/logout", {"refresh": token}, format="json", **UA)
    assert response.status_code == 204
    assert refresh(api, token).status_code == 401


def test_tokens_are_scoped_to_the_app(api, user):
    """A mobile token is refused by the web's cookie refresh, and a web token by the mobile one."""
    mobile = login(api).json()["refresh"]
    api.cookies["netfly_rt_client"] = mobile
    api.cookies["netfly_csrf_client"] = "x"
    web = api.post(
        "/api/v1/auth/refresh", {"app": "client"}, format="json", HTTP_X_CSRF_TOKEN="x", **UA
    )
    assert web.status_code == 401 and web.json()["code"] == "invalid_refresh"
    api.cookies.clear()

    api.post(
        "/api/v1/auth/login", {"username": "viewer_one", "password": "correct-horse"}, format="json"
    )
    web_token = api.cookies["netfly_rt_client"].value
    assert refresh(api, web_token).json()["code"] == "invalid_refresh"
    # A mobile logout with a web token doesn't sign the browser out either.
    api.post("/api/v1/auth/mobile/logout", {"refresh": web_token}, format="json")
    assert RefreshToken.objects.filter(app="client", revoked_at__isnull=True).exists()


def test_changing_the_password_ends_mobile_sessions(api, user):
    session = login(api).json()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {session['access']}")
    changed = api.post(
        "/api/v1/auth/me/password",
        {"current_password": "correct-horse", "new_password": "an-even-better-one"},
        format="json",
    )
    assert changed.status_code == 200
    assert api.get("/api/v1/auth/me").status_code == 401  # token_version moved on
    api.credentials()
    assert refresh(api, session["refresh"]).status_code == 401


def test_a_deactivated_account_cannot_refresh(api, user):
    token = login(api).json()["refresh"]
    user.is_active = False
    user.save(update_fields=["is_active"])
    assert refresh(api, token).status_code == 401


def test_signup_closed_and_validation(api, user):
    taken = signup(api, username="Viewer_One")
    assert taken.status_code == 400 and taken.json()["fields"]["username"]
    config.set("features.signup_enabled", False)
    closed = signup(api)
    assert closed.status_code == 403 and closed.json()["code"] == "signup_closed"


def test_refresh_rate_limit(api):
    config.set("security.rate_token_refresh", "2/min")
    codes = [refresh(api, "not-a-token").status_code for _ in range(3)]
    assert codes == [401, 401, 429]


def test_verified_email_signs_in_on_mobile(api, user):
    user.email = "viewer@example.com"
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email", "email_verified_at"])
    assert login(api, username="viewer@example.com").status_code == 200
