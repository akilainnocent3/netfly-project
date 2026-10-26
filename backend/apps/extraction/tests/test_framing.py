"""Page embeddability: X-Frame-Options, CSP frame-ancestors, mixed content, login walls."""

import httpx
import pytest

from apps.extraction.framing import evaluate_framing, source_matches

NETFLY = ["https://watch.netfly.test"]
PAGE = "https://videos.example.test/watch/1"


def verdict(headers=None, *, status=200, page=PAGE, origins=NETFLY, body=b""):
    return evaluate_framing(page, status, httpx.Headers(headers or {}), origins=origins, body=body)


def test_no_restrictions_is_yes():
    v = verdict()
    assert v["verdict"] == "yes"
    assert "can be framed" in v["reasons"][0]


@pytest.mark.parametrize("value", ["DENY", "deny", "DENY, SAMEORIGIN"])
def test_xfo_deny(value):
    v = verdict({"x-frame-options": value})
    assert v["verdict"] == "no"
    assert v["reasons"] == ["Blocked: the site forbids embedding (X-Frame-Options: DENY)."]


def test_xfo_sameorigin_blocks_other_origins_but_not_our_own():
    v = verdict({"x-frame-options": "SAMEORIGIN"})
    assert v["verdict"] == "no"
    assert "SAMEORIGIN" in v["reasons"][0]
    own = verdict({"x-frame-options": "SAMEORIGIN"}, page="https://watch.netfly.test/x")
    assert own["verdict"] == "yes"


def test_xfo_allow_from_is_ignored_like_browsers_do():
    v = verdict({"x-frame-options": "ALLOW-FROM https://watch.netfly.test"})
    assert v["verdict"] == "yes"
    assert any("ALLOW-FROM" in n for n in v["notes"])


@pytest.mark.parametrize(
    "csp, expected",
    [
        ("frame-ancestors 'none'", "no"),
        ("frame-ancestors 'self'", "no"),
        ("frame-ancestors https://watch.netfly.test", "yes"),
        ("frame-ancestors watch.netfly.test", "yes"),  # scheme-less: page scheme (https)
        ("frame-ancestors https://other.test", "no"),
        ("frame-ancestors *.netfly.test", "yes"),
        ("frame-ancestors https://*.netfly.test", "yes"),
        ("frame-ancestors *.other.test", "no"),
        ("frame-ancestors *", "yes"),
        ("frame-ancestors https:", "yes"),
        ("frame-ancestors http:", "yes"),  # http: also allows https ancestors (CSP3 upgrade)
        ("frame-ancestors https://watch.netfly.test:8443", "no"),
        ("frame-ancestors https://watch.netfly.test:*", "yes"),
        ("default-src 'self'; frame-ancestors 'self' https://watch.netfly.test; img-src *", "yes"),
        ("default-src 'none'", "yes"),  # frame-ancestors isn't inherited from default-src
    ],
)
def test_csp_frame_ancestors(csp, expected):
    assert verdict({"content-security-policy": csp})["verdict"] == expected


def test_csp_self_allows_our_own_origin():
    v = verdict(
        {"content-security-policy": "frame-ancestors 'self'"}, page="https://watch.netfly.test/p"
    )
    assert v["verdict"] == "yes"


def test_every_enforced_policy_must_allow():
    headers = httpx.Headers(
        [
            ("content-security-policy", "frame-ancestors *"),
            ("content-security-policy", "frame-ancestors https://other.test"),
        ]
    )
    assert evaluate_framing(PAGE, 200, headers, origins=NETFLY)["verdict"] == "no"


def test_csp_wins_over_xfo_and_report_only_is_not_enforced():
    v = verdict(
        {
            "content-security-policy": "frame-ancestors https://watch.netfly.test",
            "x-frame-options": "DENY",
            "content-security-policy-report-only": "frame-ancestors 'none'",
        }
    )
    assert v["verdict"] == "yes"
    assert any("ignore X-Frame-Options" in n for n in v["notes"])
    assert any("report-only" in n for n in v["notes"])


def test_meta_csp_is_not_a_header_and_does_not_count():
    body = b'<meta http-equiv="Content-Security-Policy" content="frame-ancestors \'none\'">'
    assert verdict(body=body)["verdict"] == "yes"


def test_mixed_content():
    v = verdict(page="http://videos.example.test/watch/1")
    assert v["verdict"] == "no"
    assert "mixed content" in v["reasons"][0]
    dev = verdict(page="http://videos.example.test/watch/1", origins=["http://localhost:3000"])
    assert dev["verdict"] == "yes"


def test_partial_allowance_is_unknown_and_names_the_origins():
    origins = ["https://watch.netfly.test", "http://localhost:3000"]
    v = verdict(
        {"content-security-policy": "frame-ancestors https://watch.netfly.test"}, origins=origins
    )
    assert v["verdict"] == "unknown"
    assert "localhost:3000" in v["reasons"][0]
    assert v["per_origin"] == {"https://watch.netfly.test": True, "http://localhost:3000": False}


@pytest.mark.parametrize("status", [401, 403])
def test_login_walls_are_unknown(status):
    v = verdict(status=status)
    assert v["verdict"] == "unknown"
    assert "requires sign-in or is blocked by bot protection" in v["reasons"][0]


def test_cloudflare_challenge_is_unknown():
    v = verdict({"cf-mitigated": "challenge", "server": "cloudflare"}, status=403)
    assert v["verdict"] == "unknown"
    body = b"<html><head><title>Just a moment...</title></head></html>"
    assert verdict({"server": "cloudflare"}, status=503, body=body)["verdict"] == "unknown"


def test_errors_are_no():
    assert verdict(status=404)["verdict"] == "no"


def test_cross_origin_policies_are_explained():
    v = verdict(
        {
            "cross-origin-embedder-policy": "require-corp",
            "cross-origin-resource-policy": "same-origin",
            "cross-origin-opener-policy": "same-origin",
        }
    )
    assert v["verdict"] == "yes"
    notes = " ".join(v["notes"])
    assert "Embedder-Policy" in notes and "Resource-Policy" in notes and "Opener-Policy" in notes


def test_source_matching_edge_cases():
    page = "https://videos.example.test/"
    assert not source_matches("*.netfly.test", "https://netfly.test", page)  # apex isn't *.
    assert source_matches("'self'", "https://videos.example.test", "http://videos.example.test/")
    assert not source_matches("'unsafe-inline'", "https://watch.netfly.test", page)
    assert source_matches("https://watch.netfly.test/some/path", "https://watch.netfly.test", page)
