"""Can a page render in an iframe on NETFLY's client origins?

Evaluated from the response headers the way a browser does (decision 68): CSP `frame-ancestors`
wins over X-Frame-Options when present; a `<meta>` CSP never counts for frame-ancestors.
"""

from urllib.parse import urlsplit

from apps.core.config import config

from .urls_norm import DEFAULT_PORTS, origin_of

YES, NO, UNKNOWN = "yes", "no", "unknown"


def client_origins() -> list[str]:
    """`seo.site_url` first, then the configured CORS origins (where NETFLY pages run)."""
    out: list[str] = []
    candidates = [config.get_str("seo.site_url")]
    candidates += [str(o) for o in config.get_json("security.cors_allowed_origins", []) or []]
    for value in candidates:
        value = (value or "").strip()
        if not value.startswith(("http://", "https://")):
            continue
        origin = origin_of(value)
        if origin not in out:
            out.append(origin)
    return out


def _parts(origin: str) -> tuple[str, str, int]:
    p = urlsplit(origin)
    return p.scheme, (p.hostname or "").lower(), p.port or int(DEFAULT_PORTS.get(p.scheme, "0"))


def _scheme_ok(expr_scheme: str, ancestor_scheme: str) -> bool:
    # CSP3: http: also matches https (upgrade), never the other way round.
    return expr_scheme == ancestor_scheme or (expr_scheme == "http" and ancestor_scheme == "https")


def source_matches(expr: str, ancestor: str, page: str) -> bool:
    """Does one frame-ancestors source expression allow `ancestor` for protected page `page`?"""
    expr = expr.strip()
    low = expr.lower()
    a_scheme, a_host, a_port = _parts(ancestor)
    if low == "'self'":
        p_scheme, p_host, p_port = _parts(page)
        if a_host != p_host:
            return False
        if a_scheme == p_scheme and a_port == p_port:
            return True
        return p_scheme == "http" and a_scheme == "https" and a_port in (443, p_port)
    if low == "*":
        return a_scheme in ("http", "https")
    if low.endswith(":") and "/" not in low and "." not in low:
        return _scheme_ok(low[:-1], a_scheme)
    if low.startswith("'"):
        return False  # 'unsafe-inline', nonces… mean nothing for frame-ancestors
    scheme = ""
    rest = low
    if "://" in rest:
        scheme, rest = rest.split("://", 1)
    host_port = rest.split("/", 1)[0]
    port_part = None
    if host_port.startswith("["):
        host, _, tail = host_port[1:].partition("]")
        port_part = tail[1:] if tail.startswith(":") else None
    elif ":" in host_port:
        host, port_part = host_port.rsplit(":", 1)
    else:
        host = host_port
    if scheme:
        if not _scheme_ok(scheme, a_scheme):
            return False
    else:
        p_scheme = _parts(page)[0]
        if not _scheme_ok(p_scheme, a_scheme):
            return False
    if host.startswith("*."):
        if not a_host.endswith(host[1:]):
            return False
    elif host != a_host:
        return False
    if port_part == "*":
        return True
    if port_part:
        try:
            return int(port_part) == a_port
        except ValueError:
            return False
    default = int(DEFAULT_PORTS.get(scheme or a_scheme, "0"))
    # No port: the scheme's default (or 443 after an http→https upgrade).
    return a_port == default or (scheme == "http" and a_scheme == "https" and a_port == 443)


def frame_ancestor_policies(csp_headers: list[str]) -> list[list[str]]:
    """The frame-ancestors source lists of every enforced policy (header values may be joined
    with commas; the first frame-ancestors directive of each policy counts)."""
    policies = []
    for header in csp_headers:
        for policy in header.split(","):
            for directive in policy.split(";"):
                tokens = directive.strip().split()
                if tokens and tokens[0].lower() == "frame-ancestors":
                    policies.append(tokens[1:])
                    break
    return policies


def allowed_by_sources(sources: list[str], ancestor: str, page: str) -> bool:
    if not sources or (len(sources) == 1 and sources[0].lower() == "'none'"):
        return False
    return any(source_matches(s, ancestor, page) for s in sources)


def evaluate_framing(
    page_url: str,
    status: int,
    headers,
    *,
    origins: list[str] | None = None,
    body: bytes = b"",
) -> dict:
    """{verdict, reasons[], notes[], per_origin{origin: bool}} for embedding `page_url`."""
    origins = origins if origins is not None else client_origins()
    get_list = (
        headers.get_list if hasattr(headers, "get_list") else (lambda k: _get_list(headers, k))
    )
    page_origin = origin_of(page_url)
    reasons: list[str] = []
    notes: list[str] = []

    if status in (401, 403, 429) or is_bot_challenge(status, headers, body):
        return {
            "verdict": UNKNOWN,
            "reasons": [
                f"Unknown — requires sign-in or is blocked by bot protection (HTTP {status})."
            ],
            "notes": [],
            "per_origin": {},
        }
    if status >= 400:
        return {
            "verdict": NO,
            "reasons": [f"The page isn't available (HTTP {status})."],
            "notes": [],
            "per_origin": {},
        }
    if not origins:
        return {
            "verdict": UNKNOWN,
            "reasons": [
                "Set Settings → Search & sharing → Site URL so the check knows where NETFLY runs."
            ],
            "notes": [],
            "per_origin": {},
        }

    policies = frame_ancestor_policies(get_list("content-security-policy"))
    if get_list("content-security-policy-report-only"):
        notes.append("A report-only CSP is present; browsers don't enforce it.")
    xfo_values = [
        v.strip().upper() for h in get_list("x-frame-options") for v in h.split(",") if v.strip()
    ]
    per_origin: dict[str, bool] = {}
    blocked_by: dict[str, str] = {}
    for origin in origins:
        ok = True
        why = ""
        if urlsplit(page_url).scheme == "http" and origin.startswith("https://"):
            ok, why = False, "mixed"
        elif policies:
            for sources in policies:
                if not allowed_by_sources(sources, origin, page_url):
                    ok, why = False, "csp"
                    break
        elif xfo_values:
            if "DENY" in xfo_values:
                ok, why = False, "xfo-deny"
            elif all(v == "SAMEORIGIN" for v in xfo_values):
                if origin != page_origin:
                    ok, why = False, "xfo-sameorigin"
            elif any(v.startswith("ALLOW-FROM") for v in xfo_values):
                notes.append("X-Frame-Options ALLOW-FROM is ignored by current browsers.")
            else:
                notes.append(
                    f"Unrecognised X-Frame-Options value ({', '.join(xfo_values)}) — ignored by browsers."
                )
        per_origin[origin] = ok
        if not ok:
            blocked_by[origin] = why

    if policies and xfo_values:
        notes.append("CSP frame-ancestors is present, so browsers ignore X-Frame-Options.")
    if coep := (headers.get("cross-origin-embedder-policy") or ""):
        notes.append(
            f"Cross-Origin-Embedder-Policy: {coep} — affects what the page itself loads, not whether it can be framed."
        )
    if corp := (headers.get("cross-origin-resource-policy") or ""):
        notes.append(
            f"Cross-Origin-Resource-Policy: {corp} — only blocks framing on pages that require CORP (NETFLY doesn't)."
        )
    if coop := (headers.get("cross-origin-opener-policy") or ""):
        notes.append(f"Cross-Origin-Opener-Policy: {coop} — affects pop-ups only, not iframes.")

    allowed = [o for o, ok in per_origin.items() if ok]
    reason_text = {
        "mixed": "The page is plain http, and an https NETFLY page can't frame it (mixed content).",
        "csp": f"The site forbids embedding (CSP frame-ancestors {' '.join(policies[0]) if policies else ''}).",
        "xfo-deny": "Blocked: the site forbids embedding (X-Frame-Options: DENY).",
        "xfo-sameorigin": "Blocked: the site forbids embedding (X-Frame-Options: SAMEORIGIN).",
    }
    if len(allowed) == len(origins):
        verdict = YES
        if policies:
            reasons.append("The site's CSP frame-ancestors allows NETFLY.")
        else:
            reasons.append(
                "No X-Frame-Options or frame-ancestors restriction: the page can be framed."
            )
    elif not allowed:
        verdict = NO
        for why in dict.fromkeys(blocked_by.values()):
            reasons.append(reason_text[why])
    else:
        verdict = UNKNOWN
        reasons.append(
            f"Allowed on {', '.join(allowed)} but not on {', '.join(o for o in origins if o not in allowed)}."
        )
        for why in dict.fromkeys(blocked_by.values()):
            reasons.append(reason_text[why])
    return {"verdict": verdict, "reasons": reasons, "notes": notes, "per_origin": per_origin}


def is_bot_challenge(status: int, headers, body: bytes = b"") -> bool:
    """A bot-protection interstitial instead of the page. Cloudflare injects its challenge
    scripts into ordinary pages too, so the markers only count on a refusal status."""
    if (headers.get("cf-mitigated") or "").lower() == "challenge":
        return True
    if status not in (403, 429, 503):
        return False
    server = (headers.get("server") or "").lower()
    text = body[:20000].lower() if body else b""
    return (
        "cloudflare" in server
        or b"cf-chl" in text
        or b"challenge-platform" in text
        or b"<title>just a moment...</title>" in text
    )


def _get_list(headers: dict, key: str) -> list[str]:
    for k, v in headers.items():
        if k.lower() == key:
            return v if isinstance(v, list) else [v]
    return []
