from django.urls import path

from . import verification_views as vv
from . import views

urlpatterns = [
    path("signup", views.SignupView.as_view(), name="auth-signup"),
    path("login", views.LoginView.as_view(), name="auth-login"),
    path("refresh", views.RefreshView.as_view(), name="auth-refresh"),
    path("logout", views.LogoutView.as_view(), name="auth-logout"),
    path("mobile/signup", views.MobileSignupView.as_view(), name="auth-mobile-signup"),
    path("mobile/login", views.MobileLoginView.as_view(), name="auth-mobile-login"),
    path("mobile/refresh", views.MobileRefreshView.as_view(), name="auth-mobile-refresh"),
    path("mobile/logout", views.MobileLogoutView.as_view(), name="auth-mobile-logout"),
    path(
        "username-available",
        views.UsernameAvailabilityView.as_view(),
        name="auth-username-available",
    ),
    path("me", views.MeView.as_view(), name="auth-me"),
    path("me/password", views.ChangePasswordView.as_view(), name="auth-change-password"),
    path("verify", vv.VerifyStatusView.as_view(), name="verify-status"),
    path("verify/<str:channel>/start", vv.VerifyStartView.as_view(), name="verify-start"),
    path("verify/<str:channel>/confirm", vv.VerifyConfirmView.as_view(), name="verify-confirm"),
    path("password-reset/start", vv.PasswordResetStartView.as_view(), name="password-reset-start"),
    path(
        "password-reset/confirm",
        vv.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
]
