from django.conf import settings
from django.db import models


class ConfigGroup(models.Model):
    key = models.SlugField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]

    def __str__(self) -> str:
        return self.key


class ConfigEntry(models.Model):
    class ValueType(models.TextChoices):
        STRING = "string"
        TEXT = "text"
        INT = "int"
        FLOAT = "float"
        BOOL = "bool"
        JSON = "json"
        SECRET = "secret"  # noqa: S105
        COLOR = "color"
        URL = "url"
        ENUM = "enum"

    key = models.CharField(max_length=150, unique=True)
    group = models.ForeignKey(ConfigGroup, on_delete=models.PROTECT, related_name="entries")
    label = models.CharField(max_length=150, blank=True)
    value_type = models.CharField(max_length=10, choices=ValueType.choices)
    # Plain values are stored as JSON. Secrets live only in `encrypted_value`.
    value = models.JSONField(null=True, blank=True)
    encrypted_value = models.TextField(blank=True, default="")
    is_secret = models.BooleanField(default=False)
    is_public = models.BooleanField(default=False)
    description = models.TextField(blank=True)
    unit = models.CharField(max_length=20, blank=True)
    # {"choices": [...]} for enums, {"regex": "..."}, {"min": .., "max": ..} or {"schema": {...}}
    validation = models.JSONField(default=dict, blank=True)
    order = models.PositiveIntegerField(default=0)
    requires_restart = models.BooleanField(default=False)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["group__order", "order", "key"]

    def __str__(self) -> str:
        return self.key

    @property
    def has_value(self) -> bool:
        return bool(self.encrypted_value) if self.is_secret else self.value is not None


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    action = models.CharField(max_length=60, db_index=True)
    target_type = models.CharField(max_length=60, db_index=True)
    target_id = models.CharField(max_length=150, blank=True, db_index=True)
    target_repr = models.CharField(max_length=255, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["target_type", "target_id", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.action} {self.target_type}:{self.target_id}"


class LegalPage(models.Model):
    slug = models.SlugField(unique=True)
    title = models.CharField(max_length=200)
    body_markdown = models.TextField(blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.slug
