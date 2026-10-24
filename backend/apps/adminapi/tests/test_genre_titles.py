"""Studio → Categories → a category: list, add and remove its titles."""

import pytest

from apps.core.models import AuditLog
from apps.recommendations.cache import catalog_version
from tests.factories import GenreFactory, SeriesFactory, TitleFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def comedy():
    return GenreFactory(name="Comedy", slug="comedy")


def url(genre):
    return f"/api/v1/admin/genres/{genre.pk}/titles"


def test_lists_titles_by_popularity(content_manager_api, comedy):
    quiet, hit = TitleFactory(popularity=1), SeriesFactory(popularity=99)
    comedy.titles.add(quiet, hit)
    body = content_manager_api.get(url(comedy)).json()
    assert body["count"] == 2
    assert [t["id"] for t in body["results"]] == [hit.pk, quiet.pk]
    first = body["results"][0]
    assert {"title", "year", "type", "poster"} <= first.keys() and first["type"] == "series"


def test_add_and_remove_in_one_call(
    content_manager_api, comedy, django_capture_on_commit_callbacks
):
    stays, goes, new_a, new_b = TitleFactory.create_batch(4)
    comedy.titles.add(stays, goes)
    before = catalog_version()
    with django_capture_on_commit_callbacks(execute=True):
        res = content_manager_api.post(
            url(comedy), {"add": [new_a.pk, new_b.pk], "remove": [goes.pk]}, format="json"
        )
    assert res.status_code == 200
    assert res.json()["count"] == 3
    assert set(comedy.titles.values_list("pk", flat=True)) == {stays.pk, new_a.pk, new_b.pk}
    assert catalog_version() > before
    log = AuditLog.objects.get(action="genre.titles")
    assert log.changes == {"added": sorted([new_a.pk, new_b.pk]), "removed": [goes.pk]}
    assert log.actor == content_manager_api.user


def test_no_op_changes_are_not_audited(content_manager_api, comedy):
    title = TitleFactory()
    comedy.titles.add(title)
    res = content_manager_api.post(url(comedy), {"add": [title.pk]}, format="json")
    assert res.status_code == 200 and res.json()["count"] == 1
    assert not AuditLog.objects.filter(action="genre.titles").exists()


def test_bad_requests_change_nothing(content_manager_api, comedy):
    title = TitleFactory()
    both = content_manager_api.post(
        url(comedy), {"add": [title.pk], "remove": [title.pk]}, format="json"
    )
    assert both.status_code == 400 and both.json()["code"] == "validation_error"
    unknown = content_manager_api.post(url(comedy), {"add": [title.pk, 999999]}, format="json")
    assert unknown.status_code == 400 and "999999" in unknown.json()["message"]
    assert not comedy.titles.exists()  # all or nothing
    assert (
        content_manager_api.post(
            "/api/v1/admin/genres/999999/titles", {"add": [title.pk]}, format="json"
        ).status_code
        == 404
    )


def test_permissions(api, auth_api, analyst_api, content_manager_api, staff_api, comedy):
    title = TitleFactory()
    body = {"add": [title.pk]}
    assert api.post(url(comedy), body, format="json").status_code == 403  # signed out
    assert auth_api.post(url(comedy), body, format="json").status_code == 403
    assert analyst_api.get(url(comedy)).status_code == 200  # read-only roles can look
    assert analyst_api.post(url(comedy), body, format="json").status_code == 403
    assert content_manager_api.post(url(comedy), body, format="json").status_code == 200
    assert staff_api.post(url(comedy), {"remove": [title.pk]}, format="json").status_code == 200


def test_rate_limited(content_manager_api, comedy):
    from apps.core.config import config

    config.set("security.rate_genre_titles", "2/min")
    assert content_manager_api.get(url(comedy)).status_code == 200
    assert content_manager_api.get(url(comedy)).status_code == 200
    limited = content_manager_api.get(url(comedy))
    assert limited.status_code == 429 and limited.json()["code"]
