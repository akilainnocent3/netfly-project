import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.core.validators import RegexValidator
from django.db import models
from django.db.models.functions import Lower

USERNAME_VALIDATOR = RegexValidator(
    r"^[A-Za-z0-9_]{3,30}$", "Use 3–30 letters, numbers or underscores."
)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def get_by_natural_key(self, username):
        return self.get(username__iexact=username)

    def create_user(self, username: str, password: str | None = None, **extra):
        extra.setdefault("full_name", username)
        user = self.model(username=username, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username: str, password: str | None = None, **extra):
        extra.update(is_staff=True, role=User.Role.SUPERADMIN)
        return self.create_user(username, password, **extra)


class User(AbstractBaseUser):
    class Role(models.TextChoices):
        SUPERADMIN = "superadmin", "Super admin"
        CONTENT_MANAGER = "content_manager", "Content manager"
        ANALYST = "analyst", "Analyst"

    class TranslationMode(models.TextChoices):
        TRANSLATED = "translated"
        NOT_TRANSLATED = "not_translated"
        ALL = "all"

    username = models.CharField(max_length=30, unique=True, validators=[USERNAME_VALIDATOR])
    full_name = models.CharField(max_length=120)
    # Contact details: only needed (and verified) for paid plans and free trials.
    email = models.EmailField(max_length=254, null=True, blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # E.164 digits without "+", e.g. 255712345678 (see apps.accounts.phone).
    phone = models.CharField(max_length=15, null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    role = models.CharField(max_length=20, choices=Role.choices, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    # Bumped on password change / admin reset: invalidates every access token.
    token_version = models.PositiveIntegerField(default=0)

    # Viewer preferences
    translation_mode = models.CharField(max_length=20, choices=TranslationMode.choices, blank=True)
    preferred_quality = models.CharField(max_length=12, blank=True)
    autoplay_next = models.BooleanField(default=True)
    autoplay_previews = models.BooleanField(default=True)
    subtitles_language = models.CharField(max_length=12, blank=True)
    notifications_seen_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("username"), name="user_username_ci_unique"),
            models.UniqueConstraint(
                Lower("email"),
                condition=models.Q(email__isnull=False),
                name="user_email_ci_unique",
            ),
            models.UniqueConstraint(
                "phone", condition=models.Q(phone__isnull=False), name="user_phone_unique"
            ),
        ]
        indexes = [models.Index(fields=["is_staff"]), models.Index(fields=["-created_at"])]

    def __str__(self) -> str:
        return self.username

    @property
    def email_verified(self) -> bool:
        return bool(self.email and self.email_verified_at)

    @property
    def phone_verified(self) -> bool:
        return bool(self.phone and self.phone_verified_at)

    def has_role(self, *roles: str) -> bool:
        if not (self.is_active and self.is_staff):
            return False
        return self.role == self.Role.SUPERADMIN or self.role in roles


class ViewerProfile(models.Model):
    """Ready for `features.profiles_enabled`; engagement rows carry a nullable FK to it."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="profiles")
    name = models.CharField(max_length=40)
    avatar_key = models.CharField(max_length=255, blank=True)
    is_kids = models.BooleanField(default=False)
    translation_mode = models.CharField(max_length=20, blank=True)
    notifications_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "name"], name="profile_unique_name")]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.name}"


class RefreshToken(models.Model):
    """Opaque refresh token (only its SHA-256 is stored). Rotated on every use;
    presenting an already-used token revokes the whole family (reuse detection)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="refresh_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    family = models.UUIDField(default=uuid.uuid4, db_index=True)
    app = models.CharField(max_length=10, default="client")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    # "Remember me" off = the cookie lives for the browser session only (kept across rotation).
    persistent = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"refresh:{self.user_id}:{self.family}"
