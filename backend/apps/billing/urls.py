from django.urls import path

from . import views

urlpatterns = [
    path("billing/plans", views.PlansView.as_view(), name="billing-plans"),
    path("billing/membership", views.MembershipView.as_view(), name="billing-membership"),
    path("billing/usage", views.UsageView.as_view(), name="billing-usage"),
    path("billing/plan", views.ChoosePlanView.as_view(), name="billing-choose-plan"),
    path("billing/auto-renew", views.AutoRenewView.as_view(), name="billing-auto-renew"),
]
