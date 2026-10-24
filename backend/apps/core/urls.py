from django.urls import path

from .app_links import AppleAppSiteAssociationView, AssetLinksView
from .brand import IntroRedirectView
from .views import LegalPageView

urlpatterns = [
    path("legal/<slug:slug>", LegalPageView.as_view(), name="legal-page"),
    path("brand/intro/<str:name>.mp4", IntroRedirectView.as_view(), name="brand-intro"),
    path("public/assetlinks.json", AssetLinksView.as_view(), name="public-assetlinks"),
    path(
        "public/apple-app-site-association",
        AppleAppSiteAssociationView.as_view(),
        name="public-apple-app-site-association",
    ),
]
