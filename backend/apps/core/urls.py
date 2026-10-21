from django.urls import path

from .brand import IntroRedirectView
from .views import LegalPageView

urlpatterns = [
    path("legal/<slug:slug>", LegalPageView.as_view(), name="legal-page"),
    path("brand/intro/<str:name>.mp4", IntroRedirectView.as_view(), name="brand-intro"),
]
