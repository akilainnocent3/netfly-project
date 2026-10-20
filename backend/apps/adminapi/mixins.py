from django.forms.models import model_to_dict
from rest_framework.pagination import PageNumberPagination

from apps.accounts.permissions import StaffPermission
from apps.core.audit import client_ip, record


class AdminPagination(PageNumberPagination):
    """Admin tables need totals and page jumps, so they use page numbers (viewer feeds use cursors)."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200


def _jsonable(value):
    if isinstance(value, list | tuple):
        return [_jsonable(v) for v in value]
    if hasattr(value, "pk"):
        return value.pk
    if isinstance(value, str | int | float | bool) or value is None:
        return value
    return str(value)


def snapshot(instance, fields=None) -> dict:
    data = model_to_dict(instance, fields=fields)
    return {k: _jsonable(v) for k, v in data.items()}


def diff(before: dict, after: dict) -> dict:
    return {k: {"old": before.get(k), "new": v} for k, v in after.items() if before.get(k) != v}


class AuditedMixin:
    """Every admin write lands in the audit log with a field-level diff."""

    permission_classes = [StaffPermission]
    audit_type = ""

    def _audit(self, action: str, instance, changes=None):
        record(
            self.request.user,
            f"{self.audit_type or instance._meta.model_name}.{action}",
            instance,
            changes=changes,
            ip=client_ip(self.request),
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        self._audit("create", instance, {"created": snapshot(instance)})

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        instance = serializer.save()
        changes = diff(before, snapshot(instance))
        if changes:
            self._audit("update", instance, changes)

    def perform_destroy(self, instance):
        self._audit("delete", instance, {"deleted": snapshot(instance)})
        instance.delete()
