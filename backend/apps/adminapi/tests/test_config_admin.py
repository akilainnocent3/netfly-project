import pytest

from apps.core.config import config

pytestmark = pytest.mark.django_db


def test_config_listing_never_contains_secrets(staff_api):
    config.set("storage.s3.secret_access_key", "very-secret-123")
    response = staff_api.get("/api/v1/admin/config")
    assert response.status_code == 200
    assert "very-secret-123" not in response.content.decode()
    entries = {e["key"]: e for g in response.json() for e in g["entries"]}
    assert entries["storage.s3.secret_access_key"]["has_value"] is True
    assert entries["storage.s3.secret_access_key"]["value"] is None


def test_update_config_validates_and_takes_effect(staff_api, api):
    bad = staff_api.patch(
        "/api/v1/admin/config/branding.accent_color", {"value": "pink"}, format="json"
    )
    assert bad.status_code == 400 and bad.json()["fields"]["value"]
    ok = staff_api.patch(
        "/api/v1/admin/config/branding.accent_color", {"value": "#3355FF"}, format="json"
    )
    assert ok.status_code == 200
    assert api.get("/api/public/config").json()["values"]["branding.accent_color"] == "#3355FF"
    history = staff_api.get("/api/v1/admin/config/branding.accent_color/history").json()
    assert history[0]["changes"]["branding.accent_color"]["new"] == "#3355FF"


def test_ladder_json_validation(staff_api):
    bad = staff_api.patch(
        "/api/v1/admin/config/transcoding.ladder",
        {"value": [{"name": "720p", "height": 720}]},
        format="json",
    )
    assert bad.status_code == 400
    ladder = [{"name": "720p", "height": 720, "video_kbps": 3000, "codec": "h264"}]
    assert (
        staff_api.patch(
            "/api/v1/admin/config/transcoding.ladder", {"value": ladder}, format="json"
        ).status_code
        == 200
    )
    assert config.get_json("transcoding.ladder") == ladder


def test_content_manager_cannot_change_settings(content_manager_api):
    response = content_manager_api.patch(
        "/api/v1/admin/config/branding.site_name", {"value": "Hacked"}, format="json"
    )
    assert response.status_code == 403


def test_storage_test_connection(staff_api, s3):
    response = staff_api.post("/api/v1/admin/storage/test", {}, format="json").json()
    assert response["ok"] is True and "write ok" in response["steps"]
    wrong = staff_api.post(
        "/api/v1/admin/storage/test", {"bucket": "does-not-exist"}, format="json"
    ).json()
    assert wrong["ok"] is False


def test_apply_cors(staff_api, s3):
    assert staff_api.post("/api/v1/admin/storage/apply-cors").json()["ok"] is True
    rules = s3.get_bucket_cors(Bucket="netfly-test")["CORSRules"]
    assert "http://localhost:3000" in rules[0]["AllowedOrigins"]


def test_legal_pages_editable(staff_api, api):
    staff_api.patch("/api/v1/admin/legal/terms", {"body_markdown": "# New terms"}, format="json")
    assert api.get("/api/v1/legal/terms").json()["body_markdown"] == "# New terms"
