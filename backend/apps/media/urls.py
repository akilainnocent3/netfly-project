from django.urls import path

from . import views

urlpatterns = [
    path(
        "img/images/<uuid:asset_id>/v<int:version>/w<int:width>",
        views.ImageRedirectView.as_view(),
        name="image-redirect",
    ),
    path(
        "stream/<uuid:asset_id>/thumbs.vtt",
        views.ThumbnailsView.as_view(),
        name="stream-thumbnails",
    ),
    path(
        "stream/<uuid:asset_id>/<str:name>.m3u8", views.StreamView.as_view(), name="stream-playlist"
    ),
]
