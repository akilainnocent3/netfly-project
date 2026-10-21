import datetime as dt

import pytest
from django.utils import timezone

from apps.accounts.models import RefreshToken, User
from apps.core.config import config

pytestmark = pytest.mark.django_db


def signup(api, username="new_viewer", password="long-enough-pw", app="client", **extra):
    return api.post(
        "/api/v1/auth/signup",
        {"username": username, "full_name": "New Viewer", "password": password, "app": app},
        format="json",
        **extra,
    )


def refresh(api, app="client", **extra):
    csrf = api.cookies[f"netfly_csrf_{app}"].value
    return api.post(
        "/api/v1/auth/refresh", {"app": app}, format="json", HTTP_X_CSRF_TOKEN=csrf, **extra
    )


def test_signup_sets_httponly_refresh_cookie(api):
    response = signup(api)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["user"]["username"] == "new_viewer"
    assert body["access"]
    cookie = response.cookies["netfly_rt_client"]
    assert cookie["httponly"] and cookie["secure"] and cookie["samesite"] == "Lax"
    assert cookie["path"] == "/api/v1/auth"
    assert User.objects.get(username="new_viewer").password.startswith(("argon2", "md5"))


def test_username_case_insensitive_unique(api, user):
    response = signup(api, username="VIEWER_ONE")
    assert response.status_code == 400
    assert response.json()["fields"]["username"] == "That username is taken."


def test_username_availability(api, user):
    assert (
        api.get("/api/v1/auth/username-available?username=Viewer_One").json()["available"] is False
    )
    free = api.get("/api/v1/auth/username-available?username=someone_else").json()
    assert free["available"] is True
    bad = api.get("/api/v1/auth/username-available?username=ab").json()
    assert bad["available"] is False and "3" in bad["message"]


def test_password_min_length_from_config(api):
    config.set("auth.password_min_length", 12)
    response = signup(api, password="short-pass")
    assert response.status_code == 400
    assert "12" in response.json()["fields"]["password"]


def test_login_and_me(api, user):
    response = api.post(
        "/api/v1/auth/login", {"username": "VIEWER_one", "password": "correct-horse"}, format="json"
    )
    assert response.status_code == 200
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access']}")
    me = api.get("/api/v1/auth/me")
    assert me.status_code == 200 and me.json()["full_name"] == "Viewer One"


def test_wrong_password_is_generic(api, user):
    response = api.post(
        "/api/v1/auth/login", {"username": "viewer_one", "password": "nope-nope"}, format="json"
    )
    assert response.status_code == 400
    assert response.json() == {
        "code": "invalid_credentials",
        "message": "Wrong username or password.",
    }


def test_lockout_after_max_attempts(api, user):
    config.set("auth.login_max_attempts", 3)
    config.set("security.rate_login", "100/min")
    for _ in range(3):
        api.post(
            "/api/v1/auth/login", {"username": "viewer_one", "password": "bad-guess"}, format="json"
        )
    locked = api.post(
        "/api/v1/auth/login", {"username": "viewer_one", "password": "correct-horse"}, format="json"
    )
    assert locked.status_code == 429 and locked.json()["code"] == "account_locked"


def test_login_rate_limit(api, user):
    config.set("security.rate_login", "2/min")
    codes = [
        api.post(
            "/api/v1/auth/login", {"username": "x_user", "password": "whatever1"}, format="json"
        ).status_code
        for _ in range(3)
    ]
    assert codes[-1] == 429


def test_refresh_rotation_and_reuse_detection(api):
    config.set("auth.refresh_reuse_grace_seconds", 0)  # strict: any reuse is theft
    signup(api)
    old_refresh = api.cookies["netfly_rt_client"].value
    first = refresh(api)
    assert first.status_code == 200
    assert api.cookies["netfly_rt_client"].value != old_refresh

    # Replay the already-rotated token: the whole family is revoked.
    api.cookies["netfly_rt_client"] = old_refresh
    replay = refresh(api)
    assert replay.status_code == 401 and replay.json()["code"] == "refresh_reused"
    assert not RefreshToken.objects.filter(revoked_at__isnull=True).exists()


def test_lost_refresh_response_is_forgiven_for_the_same_browser(api):
    signup(api, HTTP_USER_AGENT="Browser/1")
    old_refresh = api.cookies["netfly_rt_client"].value
    assert refresh(api, HTTP_USER_AGENT="Browser/1").status_code == 200
    # The new cookie never arrived (navigation aborted the response): the old one comes back.
    api.cookies["netfly_rt_client"] = old_refresh
    again = refresh(api, HTTP_USER_AGENT="Browser/1")
    assert again.status_code == 200
    assert not RefreshToken.objects.filter(revoked_at__isnull=False).exists()


def test_reuse_from_another_browser_or_after_the_grace_window_revokes(api):
    signup(api, HTTP_USER_AGENT="Browser/1")
    old_refresh = api.cookies["netfly_rt_client"].value
    assert refresh(api, HTTP_USER_AGENT="Browser/1").status_code == 200
    api.cookies["netfly_rt_client"] = old_refresh
    stolen = refresh(api, HTTP_USER_AGENT="Attacker/9")
    assert stolen.status_code == 401 and stolen.json()["code"] == "refresh_reused"
    assert not RefreshToken.objects.filter(revoked_at__isnull=True).exists()

    signup(api, username="viewer_two", HTTP_USER_AGENT="Browser/1")
    old_refresh = api.cookies["netfly_rt_client"].value
    assert refresh(api, HTTP_USER_AGENT="Browser/1").status_code == 200
    RefreshToken.objects.filter(used_at__isnull=False).update(
        used_at=timezone.now() - dt.timedelta(seconds=61)
    )
    api.cookies["netfly_rt_client"] = old_refresh
    late = refresh(api, HTTP_USER_AGENT="Browser/1")
    assert late.status_code == 401 and late.json()["code"] == "refresh_reused"


def test_refresh_requires_csrf(api):
    signup(api)
    response = api.post("/api/v1/auth/refresh", {"app": "client"}, format="json")
    assert response.status_code == 403 and response.json()["code"] == "csrf_failed"


def test_logout_revokes(api):
    signup(api)
    raw = api.cookies["netfly_rt_client"].value
    csrf = api.cookies["netfly_csrf_client"].value
    assert (
        api.post(
            "/api/v1/auth/logout", {"app": "client"}, format="json", HTTP_X_CSRF_TOKEN=csrf
        ).status_code
        == 204
    )
    api.cookies["netfly_rt_client"] = raw
    api.cookies["netfly_csrf_client"] = csrf
    assert refresh(api).status_code == 401


def test_admin_app_requires_staff(api, user, staff):
    denied = api.post(
        "/api/v1/auth/login",
        {"username": "viewer_one", "password": "correct-horse", "app": "admin"},
        format="json",
    )
    assert denied.status_code == 403
    ok = api.post(
        "/api/v1/auth/login",
        {"username": "boss", "password": "correct-horse", "app": "admin"},
        format="json",
    )
    assert ok.status_code == 200 and "netfly_rt_admin" in ok.cookies


def test_change_password_invalidates_old_access_tokens(auth_api):
    response = auth_api.post(
        "/api/v1/auth/me/password",
        {"current_password": "correct-horse", "new_password": "an-even-better-one"},
        format="json",
    )
    assert response.status_code == 200
    assert auth_api.get("/api/v1/auth/me").status_code == 401


def test_errors_have_consistent_shape(api):
    body = api.post("/api/v1/auth/signup", {}, format="json").json()
    assert set(body) == {"code", "message", "fields"}
    assert body["code"] == "validation_error"


def test_cookie_setting_auth_endpoints_accept_json_only(api, user):
    """A cross-site HTML form (urlencoded / multipart) can't sign anyone in (login CSRF)."""
    for path, body in [
        ("/api/v1/auth/login", {"username": "viewer_one", "password": "correct-horse"}),
        (
            "/api/v1/auth/signup",
            {"username": "csrf_x", "full_name": "X", "password": "pw-123456789"},
        ),
        (
            "/api/v1/auth/password-reset/confirm",
            {"reset_token": "t", "code": "1", "new_password": "x"},
        ),
    ]:
        assert api.post(path, body, format="multipart").status_code == 415
    assert (
        api.post(
            "/api/v1/auth/login",
            {"username": "viewer_one", "password": "correct-horse", "app": "client"},
            format="json",
        ).status_code
        == 200
    )
