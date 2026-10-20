import pytest

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.engagement.models import ViewEvent
from tests.factories import TitleFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_dashboard_metrics(analyst_api):
    from django.utils import timezone

    title = TitleFactory()
    now = timezone.now()
    for i, (kind, value) in enumerate([("start", 800), ("start", 1200), ("rebuffer", 900), ("quality", 5_000_000)]):
        ViewEvent.objects.create(user_id=1, title_id=title.pk, session_id="s1" if i != 1 else "s2", kind=kind, value=value, created_at=now, data={"height": 1080} if kind == "quality" else {})
    body = analyst_api.get("/api/v1/admin/dashboard?range=7d").json()
    assert body["plays_today"] == 2 and body["avg_startup_ms"] == 1000
    assert body["rebuffer_ratio"] == 0.5
    assert body["top_titles"][0]["title"] == title.title
    assert len(body["series"]) == 7 and body["series"][-1]["plays"] == 2
    assert body["quality_mix"] == {"1080p": 1}


def test_disable_and_reset_password(content_manager_api, api):
    viewer = UserFactory(username="someone")
    assert content_manager_api.post(f"/api/v1/admin/users/{viewer.pk}/disable").json()["is_active"] is False
    login = api.post("/api/v1/auth/login", {"username": "someone", "password": "correct-horse"}, format="json")
    assert login.status_code == 400
    content_manager_api.post(f"/api/v1/admin/users/{viewer.pk}/enable")
    temp = content_manager_api.post(f"/api/v1/admin/users/{viewer.pk}/reset-password").json()["temporary_password"]
    assert api.post("/api/v1/auth/login", {"username": "someone", "password": temp}, format="json").status_code == 200
    assert AuditLog.objects.filter(action="user.reset_password").exists()
    assert temp not in str(list(AuditLog.objects.values_list("changes", flat=True)))


def test_analyst_cannot_disable(analyst_api):
    viewer = UserFactory()
    assert analyst_api.post(f"/api/v1/admin/users/{viewer.pk}/disable").status_code == 403
    assert analyst_api.get(f"/api/v1/admin/users/{viewer.pk}").status_code == 200


def test_staff_management_is_superadmin_only(staff_api, content_manager_api):
    assert content_manager_api.get("/api/v1/admin/staff").status_code == 403
    created = staff_api.post("/api/v1/admin/staff", {"username": "new_editor", "full_name": "Ed", "role": "content_manager", "password": "long-password-1"}, format="json")
    assert created.status_code == 201 and created.json()["role"] == "content_manager"
    editor = User.objects.get(username="new_editor")
    assert staff_api.patch(f"/api/v1/admin/staff/{editor.pk}", {"role": "analyst"}, format="json").json()["role"] == "analyst"
    assert staff_api.delete(f"/api/v1/admin/staff/{editor.pk}").status_code == 204
    editor.refresh_from_db()
    assert not editor.is_staff
    assert staff_api.delete(f"/api/v1/admin/staff/{staff_api.user.pk}").status_code == 400  # can't remove yourself


def test_audit_log_filters(staff_api):
    staff_api.patch("/api/v1/admin/config/branding.site_name", {"value": "STREAMIX"}, format="json")
    logs = staff_api.get("/api/v1/admin/audit?action=config").json()
    assert logs["count"] >= 1 and logs["results"][0]["actor"] == staff_api.user.username
