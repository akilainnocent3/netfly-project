from django.urls import path

from . import views

urlpatterns = [
    path("signup", views.SignupView.as_view(), name="auth-signup"),
    path("login", views.LoginView.as_view(), name="auth-login"),
    path("refresh", views.RefreshView.as_view(), name="auth-refresh"),
    path("logout", views.LogoutView.as_view(), name="auth-logout"),
    path(
        "username-available",
        views.UsernameAvailabilityView.as_view(),
        name="auth-username-available",
    ),
    path("me", views.MeView.as_view(), name="auth-me"),
    path("me/password", views.ChangePasswordView.as_view(), name="auth-change-password"),
]
