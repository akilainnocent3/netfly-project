"""Free-trial abuse protection: one trial per account, per verified phone, per verified email."""

from __future__ import annotations

from django.db.models import Q

from .models import TrialClaim


def trial_already_used(user) -> bool:
    q = Q(user_id=user.pk)
    if user.phone and user.phone_verified_at:
        q |= Q(phone=user.phone)
    if user.email and user.email_verified_at:
        q |= Q(email=user.email.lower())
    return TrialClaim.objects.filter(q).exists()


def claim_trial(user, plan) -> TrialClaim:
    return TrialClaim.objects.create(
        user=user,
        plan=plan,
        phone=user.phone or "",
        email=(user.email or "").lower(),
    )
