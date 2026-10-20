from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from apps.core.views import HealthView, PublicConfigView

urlpatterns = [
    path("api/health", HealthView.as_view(), name="health"),
    path("api/public/config", PublicConfigView.as_view(), name="public-config"),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.catalog.urls")),
    path("api/v1/", include("apps.media.urls")),
    path("api/v1/", include("apps.engagement.urls")),
    path("api/v1/", include("apps.recommendations.urls")),
    path("api/v1/admin/", include("apps.adminapi.urls")),
]
