import pytest

from apps.core.config import ConfigValidationError, config

pytestmark = pytest.mark.django_db

FINGERPRINT = ":".join(["AB"] * 32)


def test_nothing_is_served_until_configured(api):
    assert api.get("/api/v1/public/assetlinks.json").status_code == 404
    assert api.get("/api/v1/public/apple-app-site-association").status_code == 404


def test_assetlinks_names_the_package_and_certificates(api):
    config.set("mobile.android_cert_sha256", f"{FINGERPRINT.lower()}, {':'.join(['CD'] * 32)}")
    response = api.get("/api/v1/public/assetlinks.json")
    assert response.status_code == 200
    assert response["Cache-Control"] == "public, max-age=3600"
    [statement] = response.json()
    assert statement["relation"] == ["delegate_permission/common.handle_all_urls"]
    assert statement["target"] == {
        "namespace": "android_app",
        "package_name": "app.netfly.netfly",
        "sha256_cert_fingerprints": [FINGERPRINT, ":".join(["CD"] * 32)],
    }


def test_apple_association_covers_title_pages(api):
    config.set("mobile.ios_app_ids", "ABCDE12345.app.netfly.netfly")
    body = api.get("/api/v1/public/apple-app-site-association").json()
    assert body == {
        "applinks": {
            "details": [
                {"appIDs": ["ABCDE12345.app.netfly.netfly"], "components": [{"/": "/title/*"}]}
            ]
        }
    }


def test_invalid_values_are_refused():
    for key, value in [
        ("mobile.android_cert_sha256", "not-a-fingerprint"),
        ("mobile.ios_app_ids", "app.netfly.netfly"),
        ("mobile.android_package", "netfly"),
    ]:
        with pytest.raises(ConfigValidationError):
            config.set(key, value)
