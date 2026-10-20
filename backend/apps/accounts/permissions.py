"""Staff role permissions.

* superadmin       — everything (settings, staff & roles, audit log)
* content_manager  — catalog, media, home layout, users (read + disable)
* analyst          — read-only dashboards, analytics, catalog and users
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import User

R = User.Role


class IsViewer(BasePermission):
    message = "Please log in to continue."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class StaffPermission(BasePermission):
    """Views set `read_roles` / `write_roles`. Superadmin is always allowed."""

    message = "You don't have permission to do that."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_staff and user.is_active):
            return False
        read_roles = getattr(view, "read_roles", (R.CONTENT_MANAGER, R.ANALYST))
        write_roles = getattr(view, "write_roles", (R.CONTENT_MANAGER,))
        roles = read_roles if request.method in SAFE_METHODS else write_roles
        return user.has_role(*roles)


class SuperadminOnly(StaffPermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff and user.role == R.SUPERADMIN)
