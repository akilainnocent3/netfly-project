from django.urls import path

from . import views

urlpatterns = [
    path(
        "img/images/<uuid:asset_id>/v<int:version>/w<int:width>",
        views.ImageRedirectView.as_view(),
        name="image-redirect",
    ),
]
