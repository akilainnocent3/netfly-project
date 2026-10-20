from django.urls import path

from .views import LegalPageView

urlpatterns = [path("legal/<slug:slug>", LegalPageView.as_view(), name="legal-page")]
