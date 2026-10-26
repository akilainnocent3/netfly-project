"""Studio API: jobs, links, checks, approval (rights + title + description), embeds, previews."""

import csv
import io

import pytest
from django.core.cache import cache

from apps.core.config import config
from apps.core.models import AuditLog
from apps.extraction.models import ApprovedEmbed, DiscoveredLink, ExtractionJob
from apps.extraction.tasks import purge_old_jobs
from tests.factories import TitleFactory

pytestmark = pytest.mark.django_db

SITE = "https://www.example.test"
API = "/api/v1/admin/extraction"
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 2048


@pytest.fixture
def site(web):
    web.page(
        f"{SITE}/",
        """<title>Films</title><a href="/watch">Watch</a><a href="/=cmd|calc">odd</a>
        <video src="/media/film.mp4"></video>""",
    )
    web.page(
        f"{SITE}/watch",
        '<title>Watch</title><meta property="og:description" content="Our feature film, free to embed.">'
        '<video src="/media/film.mp4"></video>',
    )
    web.add(
        f"{SITE}/media/film.mp4",
        MP4,
        content_type="video/mp4",
        headers={"access-control-allow-origin": "*", "accept-ranges": "bytes"},
    )
    web.page(f"{SITE}/locked", "<p>no</p>", headers={"x-frame-options": "SAMEORIGIN"})
    return web


def start(client, url=f"{SITE}/", capture=None, **options):
    if capture is None:
        return client.post(f"{API}/jobs", {"url": url, "options": options}, format="json")
    with capture(execute=True):
        return client.post(f"{API}/jobs", {"url": url, "options": options}, format="json")


def link_for(job_id, url) -> DiscoveredLink:
    return DiscoveredLink.objects.get(job_id=job_id, url=url)


def checked(client, link, capture):
    with capture(execute=True):
        res = client.post(f"{API}/links/{link.pk}/check", {}, format="json")
    assert res.status_code == 202
    return client.get(f"{API}/links/{link.pk}").json()


# ---- roles -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/jobs"),
        ("post", "/jobs"),
        ("get", "/embeds"),
        ("get", "/capabilities"),
        ("post", "/links/1/check"),
        ("post", "/links/1/approve"),
    ],
)
def test_analysts_and_viewers_are_refused(analyst_api, auth_api, method, path):
    assert getattr(analyst_api, method)(f"{API}{path}", {}, format="json").status_code == 403
    assert getattr(auth_api, method)(f"{API}{path}", {}, format="json").status_code == 403


def test_content_managers_and_superadmins_are_allowed(content_manager_api, staff_api, web):
    assert content_manager_api.get(f"{API}/jobs").status_code == 200
    assert staff_api.get(f"{API}/jobs").status_code == 200


# ---- jobs --------------------------------------------------------------------------------------


def test_start_a_crawl_and_follow_it(content_manager_api, site, django_capture_on_commit_callbacks):
    res = start(content_manager_api, capture=django_capture_on_commit_callbacks, max_depth=1)
    assert res.status_code == 201, res.json()
    job_id = res.json()["id"]
    detail = content_manager_api.get(f"{API}/jobs/{job_id}").json()
    assert detail["status"] == "done"
    assert detail["pages_crawled"] == 3  # /, /watch and /=cmd|calc (a 404)
    assert detail["kind_counts"]["video_file"] == 1
    assert [v["url"] for v in detail["video_links"]] == [f"{SITE}/media/film.mp4"]
    assert detail["options"]["max_depth"] == 1
    assert detail["created_by_name"] == "content_manager"
    log = AuditLog.objects.get(action="extraction_job.create")
    assert log.changes["url"] == f"{SITE}/"
    assert log.actor == content_manager_api.user
    listing = content_manager_api.get(f"{API}/jobs").json()
    assert listing["count"] == 1 and listing["results"][0]["id"] == job_id


@pytest.mark.parametrize(
    "url, code, message",
    [
        (
            "ftp://www.example.test/",
            "invalid_scheme",
            "Only http:// and https:// addresses can be checked.",
        ),
        (
            "www.example.test",
            "invalid_scheme",
            "Only http:// and https:// addresses can be checked.",
        ),
        (
            "http://127.0.0.1/",
            "blocked_url",
            "That address is a loopback address, which can't be checked.",
        ),
        (
            "http://192.168.0.1/",
            "blocked_url",
            "That address is a private network address, which can't be checked.",
        ),
        (
            "https://www.example.test:8443/",
            "blocked_port",
            "Port 8443 isn't allowed. Only standard web ports can be checked.",
        ),
    ],
)
def test_start_url_is_validated_server_side(content_manager_api, web, url, code, message):
    res = start(content_manager_api, url)
    assert res.status_code == 400
    assert res.json() == {"code": code, "message": message, "fields": {"url": message}}
    assert not ExtractionJob.objects.exists()


def test_private_dns_answer_is_refused_at_start(content_manager_api, web):
    web.resolve("sneaky.example.test", "10.9.8.7")
    res = start(content_manager_api, "https://sneaky.example.test/")
    assert res.status_code == 400 and "private network" in res.json()["message"]


def test_per_user_concurrent_job_limit(content_manager_api, staff_api, web):
    config.set("extraction.max_concurrent_jobs", 2)
    assert start(content_manager_api).status_code == 201  # queued (on_commit not run)
    assert start(content_manager_api).status_code == 201
    third = start(content_manager_api)
    assert third.status_code == 429
    assert third.json()["code"] == "too_many_jobs"
    assert start(staff_api).status_code == 201  # someone else's limit is their own


def test_cancel(content_manager_api, web):
    job_id = start(content_manager_api).json()["id"]
    res = content_manager_api.post(f"{API}/jobs/{job_id}/cancel")
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert AuditLog.objects.filter(action="extraction_job.cancel").exists()
    again = content_manager_api.post(f"{API}/jobs/{job_id}/cancel")
    assert again.status_code == 409 and again.json()["code"] == "not_running"


def test_starting_is_rate_limited(content_manager_api, web):
    config.set("security.rate_extraction_start", "2/hour")
    config.set("extraction.max_concurrent_jobs", 10)
    assert start(content_manager_api).status_code == 201
    assert start(content_manager_api).status_code == 201
    limited = start(content_manager_api)
    assert limited.status_code == 429 and limited.json()["code"] == "rate_limited"


def test_reads_and_writes_are_rate_limited(content_manager_api, web):
    config.set("security.rate_extraction", "2/min")
    assert content_manager_api.get(f"{API}/jobs").status_code == 200
    assert content_manager_api.get(f"{API}/embeds").status_code == 200
    assert content_manager_api.get(f"{API}/jobs").status_code == 429
    cache.clear()
    config.set("security.rate_extraction_write", "1/min")
    job = ExtractionJob.objects.create(start_url=f"{SITE}/", status="crawling")
    link = DiscoveredLink.objects.create(job=job, url=f"{SITE}/x", kind="page")
    assert (
        content_manager_api.post(f"{API}/links/{link.pk}/check", {}, format="json").status_code
        == 202
    )
    assert content_manager_api.post(f"{API}/jobs/{job.pk}/cancel").status_code == 429


# ---- links ---------------------------------------------------------------------------------------


def make_links(job):
    rows = [
        ("https://www.example.test/", "page", True, False),
        ("https://www.example.test/a", "page", True, False),
        ("https://www.example.test/v.mp4", "video_file", True, True),
        ("https://cdn.test/s.m3u8", "stream", False, True),
        ("https://www.youtube.com/embed/x", "embed", False, True),
        ("https://www.example.test/i.png", "image", True, False),
    ]
    for url, kind, internal, has_video in rows:
        DiscoveredLink.objects.create(
            job=job, url=url, kind=kind, is_internal=internal, has_video=has_video, title=url[-5:]
        )


def test_link_filters_search_and_ordering(content_manager_api, web):
    job = ExtractionJob.objects.create(start_url=f"{SITE}/", status="done")
    make_links(job)
    url = f"{API}/jobs/{job.pk}/links"

    def urls(**params):
        return [r["url"] for r in content_manager_api.get(url, params).json()["results"]]

    assert len(urls()) == 6
    assert urls(kind="videos") == ["https://www.example.test/v.mp4", "https://cdn.test/s.m3u8"]
    assert urls(kind="embeds") == ["https://www.youtube.com/embed/x"]
    assert urls(kind="pages,other") == [
        "https://www.example.test/",
        "https://www.example.test/a",
        "https://www.example.test/i.png",
    ]
    assert len(urls(internal="false")) == 2
    assert len(urls(has_video="true")) == 3
    assert urls(search="m3u8") == ["https://cdn.test/s.m3u8"]
    assert urls(ordering="-url")[0] == "https://www.youtube.com/embed/x"
    assert urls(ordering="drop table")[0] == "https://www.example.test/"  # unknown → default
    page = content_manager_api.get(url, {"page_size": 2, "page": 2}).json()
    assert page["count"] == 6 and len(page["results"]) == 2


def test_csv_export(content_manager_api, web):
    job = ExtractionJob.objects.create(start_url=f"{SITE}/", status="done")
    make_links(job)
    DiscoveredLink.objects.create(job=job, url=f"{SITE}/f", kind="page", title="=HYPERLINK(1)")
    res = content_manager_api.get(
        f"{API}/jobs/{job.pk}/links", {"format": "csv", "kind": "videos,pages"}
    )
    assert res.status_code == 200
    assert res["Content-Type"].startswith("text/csv")
    assert 'filename="netfly-links-www-example-test.csv"' in res["Content-Disposition"]
    body = b"".join(res.streaming_content).decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(body)))
    assert rows[0][:3] == ["url", "kind", "source"]
    assert len(rows) == 1 + 5
    assert "'=HYPERLINK(1)" in body  # formula injection neutralised


# ---- checks, approval, embeds -------------------------------------------------------------------


@pytest.fixture
def crawled(content_manager_api, site, django_capture_on_commit_callbacks):
    job_id = start(
        content_manager_api, capture=django_capture_on_commit_callbacks, max_depth=1
    ).json()["id"]
    return job_id


def test_check_runs_async_and_stores_the_result(
    content_manager_api, crawled, django_capture_on_commit_callbacks
):
    link = link_for(crawled, f"{SITE}/watch")
    detail = checked(content_manager_api, link, django_capture_on_commit_callbacks)
    assert detail["check_status"] == "checked"
    result = detail["check_result"]
    assert result["page_embeddable"]["verdict"] == "yes"
    assert result["description"] == "Our feature film, free to embed."
    [video] = result["videos"]
    assert video["kind"] == "file" and video["playable_in_netfly"]["verdict"] == "yes"
    assert result["recommended"] == 0
    assert detail["has_video"] is True
    assert AuditLog.objects.filter(action="extraction_link.check").count() == 1


def test_check_results_are_cached_per_url(
    content_manager_api, crawled, site, django_capture_on_commit_callbacks
):
    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    before = len(site.requests)
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    assert len(site.requests) == before  # served from the 1-hour cache
    with django_capture_on_commit_callbacks(execute=True):
        content_manager_api.post(f"{API}/links/{link.pk}/check", {"force": True}, format="json")
    assert len(site.requests) > before  # Recheck runs again


def approve_body(**overrides):
    body = {
        "video_index": 0,
        "title": "Our feature film",
        "description": "A full-length feature, embedded with the owner's permission.",
        "rights_confirmed": True,
        "note": "Licence email from the owner, 2026-10-20.",
    }
    body.update(overrides)
    return body


def test_approve_requires_rights_confirmation(
    content_manager_api, crawled, django_capture_on_commit_callbacks
):
    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    for value in (False, None):
        body = (
            approve_body(rights_confirmed=value)
            if value is not None
            else {k: v for k, v in approve_body().items() if k != "rights_confirmed"}
        )
        res = content_manager_api.post(f"{API}/links/{link.pk}/approve", body, format="json")
        assert res.status_code == 400
        assert "rights_confirmed" in res.json()["fields"]
    assert not ApprovedEmbed.objects.exists()


@pytest.mark.parametrize(
    "overrides, field",
    [
        ({"title": "   "}, "title"),
        ({"title": ""}, "title"),
        ({"description": ""}, "description"),
        ({"description": "too short"}, "description"),
        ({"video_index": "first"}, "video_index"),
        ({"netfly_title_id": 999999}, "netfly_title_id"),
    ],
)
def test_approve_requires_a_title_and_description(
    content_manager_api, crawled, django_capture_on_commit_callbacks, overrides, field
):
    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    res = content_manager_api.post(
        f"{API}/links/{link.pk}/approve", approve_body(**overrides), format="json"
    )
    assert res.status_code == 400
    assert field in res.json()["fields"]


def test_approve_creates_an_audited_embed_that_viewers_do_not_see(
    content_manager_api, crawled, django_capture_on_commit_callbacks
):
    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    title = TitleFactory(title="Feature")
    res = content_manager_api.post(
        f"{API}/links/{link.pk}/approve",
        approve_body(netfly_title_id=title.pk, title="  Our feature film  "),
        format="json",
    )
    assert res.status_code == 201, res.json()
    embed = res.json()
    assert embed["status"] == "approved"
    assert embed["embed_type"] == "mp4"
    assert embed["embed_url"] == f"{SITE}/media/film.mp4"
    assert embed["title"] == "Our feature film"
    assert embed["description"].startswith("A full-length feature")
    assert embed["netfly_title"]["id"] == title.pk
    assert embed["rights_confirmed"] is True
    assert embed["rights_note"] == "Licence email from the owner, 2026-10-20."
    assert embed["job_id"] == str(crawled)
    log = AuditLog.objects.get(action="approved_embed.approve")
    assert log.changes["rights_confirmed"] is True and log.changes["embed_type"] == "mp4"
    assert log.actor == content_manager_api.user
    # Approving the same video twice is refused.
    dup = content_manager_api.post(f"{API}/links/{link.pk}/approve", approve_body(), format="json")
    assert dup.status_code == 409 and dup.json()["code"] == "already_approved"


def test_approve_refuses_a_video_without_a_yes(
    content_manager_api, crawled, django_capture_on_commit_callbacks
):
    link = DiscoveredLink.objects.create(job_id=crawled, url=f"{SITE}/locked", kind="page")
    detail = checked(content_manager_api, link, django_capture_on_commit_callbacks)
    assert detail["check_result"]["page_embeddable"]["verdict"] == "no"
    assert "SAMEORIGIN" in detail["check_result"]["page_embeddable"]["reasons"][0]
    res = content_manager_api.post(
        f"{API}/links/{link.pk}/approve", approve_body(video_index="page"), format="json"
    )
    assert res.status_code == 409 and res.json()["code"] == "not_embeddable"


def test_approve_needs_a_checked_link(content_manager_api, crawled):
    link = link_for(crawled, f"{SITE}/watch")
    res = content_manager_api.post(f"{API}/links/{link.pk}/approve", approve_body(), format="json")
    assert res.status_code == 409 and res.json()["code"] == "not_checked"


def test_approve_the_page_itself(content_manager_api, crawled, django_capture_on_commit_callbacks):
    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    res = content_manager_api.post(
        f"{API}/links/{link.pk}/approve", approve_body(video_index="page"), format="json"
    )
    assert res.status_code == 201
    assert res.json()["embed_type"] == "iframe"
    assert res.json()["embed_html"].startswith(f'<iframe src="{SITE}/watch"')


def test_embeds_list_edit_and_revoke(
    content_manager_api, crawled, django_capture_on_commit_callbacks
):
    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    embed_id = content_manager_api.post(
        f"{API}/links/{link.pk}/approve", approve_body(), format="json"
    ).json()["id"]
    listing = content_manager_api.get(f"{API}/embeds", {"status": "approved"}).json()
    assert [e["id"] for e in listing["results"]] == [embed_id]
    edited = content_manager_api.patch(
        f"{API}/embeds/{embed_id}", {"title": "Renamed", "description": "x"}, format="json"
    )
    assert edited.status_code == 400 and "description" in edited.json()["fields"]
    edited = content_manager_api.patch(
        f"{API}/embeds/{embed_id}", {"title": "Renamed"}, format="json"
    )
    assert edited.status_code == 200 and edited.json()["title"] == "Renamed"
    assert AuditLog.objects.get(action="approved_embed.update").changes == {
        "title": {"old": "Our feature film", "new": "Renamed"}
    }
    revoked = content_manager_api.post(f"{API}/embeds/{embed_id}/revoke")
    assert revoked.status_code == 200 and revoked.json()["status"] == "revoked"
    assert revoked.json()["revoked_by_name"] == "content_manager"
    assert AuditLog.objects.filter(action="approved_embed.revoke").exists()
    assert content_manager_api.post(f"{API}/embeds/{embed_id}/revoke").status_code == 409
    assert content_manager_api.get(f"{API}/embeds", {"status": "approved"}).json()["count"] == 0


def test_preview_tokens_carry_only_server_side_origins(
    content_manager_api, api, crawled, django_capture_on_commit_callbacks
):
    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    token = content_manager_api.get(f"{API}/links/{link.pk}/preview-token", {"video": 0}).json()[
        "token"
    ]
    preview = api.get(f"{API}/preview", {"token": token})  # no session: the token is the auth
    assert preview.status_code == 200
    body = preview.json()
    assert body["embed"] == {"type": "mp4", "src": f"{SITE}/media/film.mp4", "html": ""}
    assert body["origins"] == {"frame": [], "media": [SITE], "connect": [SITE]}
    assert body["verdict"] == "yes"
    page = content_manager_api.get(
        f"{API}/links/{link.pk}/preview-token", {"video": "page"}
    ).json()["token"]
    assert api.get(f"{API}/preview", {"token": page}).json()["origins"]["frame"] == [SITE]
    tampered = token[:-2] + ("AA" if not token.endswith("AA") else "BB")
    assert api.get(f"{API}/preview", {"token": tampered}).status_code == 404
    assert api.get(f"{API}/preview", {"token": ""}).json()["code"] == "invalid_token"


def test_preview_token_of_a_demoted_user_stops_working(
    content_manager_api, api, crawled, django_capture_on_commit_callbacks
):
    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    token = content_manager_api.get(f"{API}/links/{link.pk}/preview-token", {"video": 0}).json()[
        "token"
    ]
    user = content_manager_api.user
    user.role = "analyst"
    user.save()
    assert api.get(f"{API}/preview", {"token": token}).status_code == 404


def test_capabilities_without_a_worker(content_manager_api, web):
    caps = content_manager_api.get(f"{API}/capabilities").json()
    assert caps["render_js"] is False
    assert caps["render_js_reason"]
    assert caps["max_pages"] == 200 and caps["max_depth"] == 2 and caps["respect_robots"] is True


# ---- retention --------------------------------------------------------------------------------


def test_retention_deletes_old_jobs_but_keeps_approved_embeds(
    content_manager_api, crawled, django_capture_on_commit_callbacks
):
    import datetime as dt

    from django.utils import timezone

    link = link_for(crawled, f"{SITE}/watch")
    checked(content_manager_api, link, django_capture_on_commit_callbacks)
    embed_id = content_manager_api.post(
        f"{API}/links/{link.pk}/approve", approve_body(), format="json"
    ).json()["id"]
    fresh = ExtractionJob.objects.create(start_url=f"{SITE}/fresh", status="done")
    running = ExtractionJob.objects.create(start_url=f"{SITE}/running", status="crawling")
    ExtractionJob.objects.exclude(pk=fresh.pk).update(
        created_at=timezone.now() - dt.timedelta(days=31)
    )
    purge_old_jobs()
    assert set(ExtractionJob.objects.values_list("pk", flat=True)) == {fresh.pk, running.pk}
    embed = ApprovedEmbed.objects.get(pk=embed_id)
    assert embed.link is None and embed.original_url == f"{SITE}/media/film.mp4"
