"""Rate limits read from DB config (e.g. `security.rate_login` = "10/min")."""

from rest_framework.throttling import SimpleRateThrottle

from .config import config


class ConfigRateThrottle(SimpleRateThrottle):
    config_key = ""
    scope = "netfly"
    per_user = False

    def get_rate(self):
        return config.get_str(self.config_key) or None

    def allow_request(self, request, view):
        # Re-read on every request so admin changes apply immediately.
        self.rate = self.get_rate()
        if self.rate is None:
            return True
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        if self.per_user and request.user and request.user.is_authenticated:
            ident = f"u{request.user.pk}"
        else:
            ident = self.get_ident(request)
        return f"throttle:{self.config_key}:{ident}"

    def parse_rate(self, rate):
        num, period = rate.split("/")
        seconds = {"sec": 1, "min": 60, "hour": 3600, "day": 86400}[period]
        return int(num), seconds


def throttle(config_key: str, per_user: bool = False) -> type[ConfigRateThrottle]:
    return type(
        f"Throttle_{config_key.replace('.', '_')}",
        (ConfigRateThrottle,),
        {"config_key": config_key, "per_user": per_user},
    )
