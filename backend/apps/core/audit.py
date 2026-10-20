from typing import Any

from django.db import models


def client_ip(request) -> str | None:
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def record(
    actor,
    action: str,
    target: models.Model | None = None,
    *,
    changes: dict[str, Any] | None = None,
    ip: str | None = None,
    target_type: str = "",
    target_id: str = "",
    target_repr: str = "",
) -> None:
    from .models import AuditLog

    if target is not None:
        target_type = target_type or target._meta.label_lower
        target_id = target_id or str(target.pk)
        target_repr = target_repr or str(target)[:255]
    AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_repr=target_repr,
        changes=changes or {},
        ip_address=ip,
    )
