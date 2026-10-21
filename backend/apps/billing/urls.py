from django.urls import path

from . import views
from .webhooks import SnippeWebhookView

urlpatterns = [
    path("billing/plans", views.PlansView.as_view(), name="billing-plans"),
    path("billing/membership", views.MembershipView.as_view(), name="billing-membership"),
    path("billing/usage", views.UsageView.as_view(), name="billing-usage"),
    path("billing/plan", views.ChoosePlanView.as_view(), name="billing-choose-plan"),
    path("billing/checkout", views.CheckoutView.as_view(), name="billing-checkout"),
    path(
        "billing/checkout/start", views.CheckoutStartView.as_view(), name="billing-checkout-start"
    ),
    path("billing/payments", views.PaymentsView.as_view(), name="billing-payments"),
    path(
        "billing/payments/<uuid:payment_id>",
        views.PaymentStatusView.as_view(),
        name="billing-payment",
    ),
    path(
        "billing/payments/<uuid:payment_id>/resend",
        views.PaymentResendView.as_view(),
        name="billing-payment-resend",
    ),
    path("billing/renew-now", views.RenewNowView.as_view(), name="billing-renew-now"),
    path("billing/notice/dismiss", views.NoticeDismissView.as_view(), name="billing-notice"),
    path("payments/webhook/snippe", SnippeWebhookView.as_view(), name="payments-webhook-snippe"),
    path("billing/auto-renew", views.AutoRenewView.as_view(), name="billing-auto-renew"),
]
