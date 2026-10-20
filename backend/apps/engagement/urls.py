from django.urls import path

from apps.catalog.playback import PlaybackView

from . import tracking, views

urlpatterns = [
    path("my-list", views.MyListView.as_view(), name="my-list"),
    path("my-list/<int:title_id>", views.MyListItemView.as_view(), name="my-list-item"),
    path("ratings/<int:title_id>", views.RatingView.as_view(), name="rating"),
    path("playback/progress", tracking.ProgressView.as_view(), name="playback-progress"),
    path("playback/events", tracking.EventsView.as_view(), name="playback-events"),
    path("playback/<slug:slug>", PlaybackView.as_view(), name="playback"),
]
