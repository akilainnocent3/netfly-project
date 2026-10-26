"""NETFLY Django settings.

Only four environment variables are read here (the bootstrap exception):
DATABASE_URL, REDIS_URL, DJANGO_SECRET_KEY, CONFIG_ENCRYPTION_KEY.
Everything else (CORS, hosts, HSTS, JWT lifetimes, storage...) is read at
runtime from the database through ``apps.core.config.config``.
"""

import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent

TESTING = "pytest" in sys.modules or "test" in sys.argv[1:2]


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable {name}")
    return value


def _database_from_url(url: str) -> dict:
    parsed = urlparse(url)
    options = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or ""),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": options,
    }


SECRET_KEY = _env("DJANGO_SECRET_KEY")
CONFIG_ENCRYPTION_KEY = _env("CONFIG_ENCRYPTION_KEY")
REDIS_URL = _env("REDIS_URL")
DATABASES = {"default": _database_from_url(_env("DATABASE_URL"))}

# The API never renders HTML error pages; host validation happens in
# apps.core.middleware.ConfigHostMiddleware against `security.allowed_hosts`.
DEBUG = False
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.postgres",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "apps.core",
    "apps.accounts",
    "apps.catalog",
    "apps.media",
    "apps.engagement",
    "apps.recommendations",
    "apps.billing",
    "apps.messaging",
    "apps.extraction",
    "apps.adminapi",
]

MIDDLEWARE = [
    "apps.core.middleware.ConfigHostMiddleware",
    "apps.core.middleware.ConfigSecurityMiddleware",
    "apps.core.middleware.ConfigCorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.core.middleware.RequestTimingMiddleware",
]

ROOT_URLCONF = "netfly.urls"
WSGI_APPLICATION = "netfly.wsgi.application"
AUTH_USER_MODEL = "accounts.User"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
]
if TESTING:
    # Argon2 stays the production hasher; tests use a fast one.
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher", *PASSWORD_HASHERS]

if TESTING:
    # Isolated Redis database so test runs never flush development data.
    _redis = urlparse(REDIS_URL)
    REDIS_URL = _redis._replace(path="/15").geturl()

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "KEY_PREFIX": "netfly-test" if TESTING else "netfly",
        "TIMEOUT": 300,
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
APPEND_SLASH = False

# Session/CSRF cookies are not used by Django itself: the API is stateless
# (JWT bearer + refresh cookie handled in apps.accounts).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [],
    "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "NETFLY API",
    "DESCRIPTION": "Streaming platform API (viewer + staff).",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "ImageKindEnum": "apps.media.models.ImageAsset.Kind",
        "ImageStatusEnum": "apps.media.models.ImageAsset.Status",
        "VideoKindEnum": "apps.media.models.VideoAsset.Kind",
        "VideoStatusEnum": "apps.media.models.VideoAsset.Status",
        "HomeRowKindEnum": "apps.catalog.models.HomeRow.Kind",
        "TitleStatusEnum": "apps.catalog.models.Title.Status",
        "TitleTypeEnum": "apps.catalog.models.Title.Type",
        "TranslationStatusEnum": "apps.catalog.models.TranslationStatus",
        "UsageScopeEnum": "apps.billing.models.UsageAdjustment.Scope",
        "SubscriptionStatusEnum": "apps.billing.models.Subscription.Status",
        "ExtractionJobStatusEnum": "apps.extraction.models.ExtractionJob.Status",
        "LinkKindEnum": "apps.extraction.models.DiscoveredLink.Kind",
        "LinkSourceEnum": "apps.extraction.models.DiscoveredLink.Source",
        "LinkCheckStatusEnum": "apps.extraction.models.DiscoveredLink.CheckStatus",
        "EmbedTypeEnum": "apps.extraction.models.ApprovedEmbed.EmbedType",
        "ApprovedEmbedStatusEnum": "apps.extraction.models.ApprovedEmbed.Status",
    },
    "SCHEMA_PATH_PREFIX": r"/api/(v1|public)",
}

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = None
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_DEFAULT_QUEUE = "default"
CELERY_TASK_ROUTES = {
    "apps.media.tasks.transcode_asset": {"queue": "transcode"},
    # Crawls and link checks fetch arbitrary sites: their own workers (decision 67).
    "apps.extraction.tasks.run_job": {"queue": "extraction"},
    "apps.extraction.tasks.check_link": {"queue": "extraction"},
}
CELERY_TASK_ALWAYS_EAGER = TESTING
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"redact": {"()": "apps.core.logging.RedactSecretsFilter"}},
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "plain",
            "filters": ["redact"],
        }
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"level": "ERROR"},
        "botocore": {"level": "WARNING"},
    },
}
