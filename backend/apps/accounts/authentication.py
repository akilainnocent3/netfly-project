import datetime as dt

import jwt
from django.utils import timezone
from rest_framework import authentication, exceptions

from .models import User
from .tokens import decode_access_token

LAST_SEEN_RESOLUTION = dt.timedelta(minutes=5)


class JWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode()
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            raise exceptions.AuthenticationFailed("Invalid authorization header.")
        try:
            payload = decode_access_token(parts[1])
        except jwt.ExpiredSignatureError as exc:
            raise exceptions.AuthenticationFailed("Session expired.", code="token_expired") from exc
        except jwt.InvalidTokenError as exc:
            raise exceptions.AuthenticationFailed("Invalid session.", code="token_invalid") from exc
        user = User.objects.filter(pk=payload["sub"], is_active=True).first()
        if user is None or user.token_version != payload.get("ver", 0):
            raise exceptions.AuthenticationFailed("Invalid session.", code="token_invalid")
        now = timezone.now()
        if user.last_seen is None or now - user.last_seen > LAST_SEEN_RESOLUTION:
            User.objects.filter(pk=user.pk).update(last_seen=now)
            user.last_seen = now
        return user, payload

    def authenticate_header(self, request):
        return self.keyword
