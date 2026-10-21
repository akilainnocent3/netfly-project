from django.urls import path

from apps.accounts.profile_views import ProfileDetailView, ProfilesView
from apps.catalog.playback import PlaybackView

from . import tracking, views

urlpatterns = [
    path("profiles", ProfilesView.as_view(), name="profiles"),
    path("profiles/<int:pk>", ProfileDetailView.as_view(), name="profile-detail"),
    path("my-list", views.MyListView.as_view(), name="my-list"),
    path("my-list/<int:title_id>", views.MyListItemView.as_view(), name="my-list-item"),
    path("ratings/<int:title_id>", views.RatingView.as_view(), name="rating"),
    path(
        "continue-watching/<int:title_id>",
        views.ContinueWatchingItemView.as_view(),
        name="continue-watching-item",
    ),
    path("reminders/<int:title_id>", views.ReminderView.as_view(), name="reminder"),
    path("notifications", views.NotificationsView.as_view(), name="notifications"),
    path("notifications/seen", views.NotificationsSeenView.as_view(), name="notifications-seen"),
    path("playback/progress", tracking.ProgressView.as_view(), name="playback-progress"),
    path("playback/events", tracking.EventsView.as_view(), name="playback-events"),
    path("playback/<slug:slug>", PlaybackView.as_view(), name="playback"),
]
