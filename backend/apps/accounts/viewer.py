"""Who is watching: the account, and (when profiles are enabled) which profile.

Every engagement query (progress, ratings, My List, reminders) and every
recommendation cache key goes through `Viewer`, so turning
`features.profiles_enabled` on scopes them per profile without touching
call sites. With profiles off, `profile_id` is always None (account-level).
"""

from __future__ import annotations

from dataclasses import dataclass

from apps.core.config import config

PROFILE_HEADER = "HTTP_X_PROFILE"


@dataclass(frozen=True)
class Viewer:
    user_id: int
    profile_id: int | None = None
    kids: bool = False

    @property
    def scope(self) -> dict:
        """Filter kwargs for engagement models (user + profile, NULL profile when disabled)."""
        return {"user_id": self.user_id, "profile_id": self.profile_id}

    @property
    def cache_id(self) -> str:
        return str(self.user_id) if self.profile_id is None else f"{self.user_id}.{self.profile_id}"


def as_viewer(value: Viewer | int) -> Viewer:
    return value if isinstance(value, Viewer) else Viewer(int(value))


def profiles_enabled() -> bool:
    return config.get_bool("features.profiles_enabled")


def viewer_for(request) -> Viewer | None:
    """Resolve (and memoise on the request) the viewer. The X-Profile header must belong to the user."""
    cached = getattr(request, "_netfly_viewer", False)
    if cached is not False:
        return cached
    user = getattr(request, "user", None)
    viewer = None
    if user is not None and user.is_authenticated:
        viewer = Viewer(user.pk)
        if profiles_enabled():
            raw = request.META.get(PROFILE_HEADER, "")
            if raw.isdigit():
                from .models import ViewerProfile

                profile = (
                    ViewerProfile.objects.filter(pk=int(raw), user_id=user.pk)
                    .only("pk", "is_kids")
                    .first()
                )
                if profile is not None:
                    viewer = Viewer(user.pk, profile.pk, profile.is_kids)
    request._netfly_viewer = viewer
    return viewer
