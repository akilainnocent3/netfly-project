"""Request middleware whose behaviour is driven by DB configuration."""

import time

from django.http import HttpResponse, JsonResponse
from django.utils.cache import patch_vary_headers

from .config import config


def _host_allowed(host: str, allowed: list[str]) -> bool:
    host = host.rsplit(":", 1)[0] if not host.endswith("]") else host
    host = host.lower()
    for pattern in allowed:
        pattern = pattern.lower()
        if pattern == "*" or host == pattern:
            return True
        if pattern.startswith(".") and (host.endswith(pattern) or host == pattern[1:]):
            return True
    return False


class ConfigHostMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host()
        if request.path == "/api/health" or _host_allowed(
            host, config.get_json("security.allowed_hosts") or []
        ):
            return self.get_response(request)
        return JsonResponse({"code": "bad_host", "message": "Host not allowed."}, status=400)


class ConfigSecurityMiddleware:
    """HSTS / SSL redirect / standard hardening headers."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (
            config.get_bool("security.ssl_redirect")
            and not request.is_secure()
            and request.path != "/api/health"
        ):
            from django.http import HttpResponsePermanentRedirect

            return HttpResponsePermanentRedirect(
                f"https://{request.get_host()}{request.get_full_path()}"
            )
        response = self.get_response(request)
        hsts = config.get_int("security.hsts_seconds")
        if hsts and request.is_secure():
            response.headers.setdefault(
                "Strict-Transport-Security", f"max-age={hsts}; includeSubDomains; preload"
            )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if "Content-Security-Policy" not in response.headers and response.get(
            "Content-Type", ""
        ).startswith("application/json"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'"
            )
        return response


class ConfigCorsMiddleware:
    """Strict CORS: only origins listed in `security.cors_allowed_origins`, with credentials."""

    ALLOW_HEADERS = "authorization, content-type, x-csrf-token, x-requested-with, x-profile"
    ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.META.get("HTTP_ORIGIN")
        allowed = bool(origin) and origin in (
            config.get_json("security.cors_allowed_origins") or []
        )
        if request.method == "OPTIONS" and request.META.get("HTTP_ACCESS_CONTROL_REQUEST_METHOD"):
            response = HttpResponse(status=204 if allowed else 403)
        else:
            response = self.get_response(request)
        if allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Allow-Headers"] = self.ALLOW_HEADERS
            response["Access-Control-Allow-Methods"] = self.ALLOW_METHODS
            response["Access-Control-Max-Age"] = "600"
            response["Access-Control-Expose-Headers"] = "Server-Timing"
        patch_vary_headers(response, ("Origin",))
        return response


class RequestTimingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.perf_counter()
        response = self.get_response(request)
        response["Server-Timing"] = f"app;dur={(time.perf_counter() - start) * 1000:.1f}"
        return response
