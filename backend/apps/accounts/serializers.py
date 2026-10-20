import re

from rest_framework import serializers

from apps.core.config import config

from .models import User

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,30}$")
APP_CHOICES = ["client", "admin"]


def validate_username_format(value: str) -> str:
    value = value.strip()
    if len(value) < 3:
        raise serializers.ValidationError("Usernames need at least 3 characters.")
    if len(value) > 30:
        raise serializers.ValidationError("Usernames can be at most 30 characters.")
    if not USERNAME_RE.match(value):
        raise serializers.ValidationError("Use only letters, numbers and underscores.")
    return value


def validate_password_length(value: str) -> str:
    minimum = config.get_int("auth.password_min_length", 8)
    if len(value) < minimum:
        raise serializers.ValidationError(f"Use at least {minimum} characters.")
    if len(value) > 256:
        raise serializers.ValidationError("That password is too long.")
    return value


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "full_name",
            "is_staff",
            "role",
            "created_at",
            "translation_mode",
            "preferred_quality",
            "autoplay_next",
            "autoplay_previews",
            "subtitles_language",
        ]
        read_only_fields = ["id", "username", "is_staff", "role", "created_at"]

    def validate_full_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Please tell us your name.")
        return value

    def validate_preferred_quality(self, value: str) -> str:
        if value and value not in {"auto", "2160", "1080", "720", "480", "360", "data_saver"}:
            raise serializers.ValidationError("Unknown quality.")
        return value


class SignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=30)
    full_name = serializers.CharField(max_length=120)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    app = serializers.ChoiceField(choices=APP_CHOICES, default="client")

    def validate_username(self, value: str) -> str:
        value = validate_username_format(value)
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("That username is taken.")
        return value

    def validate_full_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Please tell us your name.")
        return value

    def validate_password(self, value: str) -> str:
        return validate_password_length(value)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=30)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    app = serializers.ChoiceField(choices=APP_CHOICES, default="client")


class AppSerializer(serializers.Serializer):
    app = serializers.ChoiceField(choices=APP_CHOICES, default="client")


class SessionSerializer(serializers.Serializer):
    access = serializers.CharField()
    expires_in = serializers.IntegerField()
    csrf = serializers.CharField()
    user = UserSerializer()


class UsernameAvailabilitySerializer(serializers.Serializer):
    username = serializers.CharField()
    available = serializers.BooleanField()
    message = serializers.CharField(allow_blank=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)

    def validate_new_password(self, value: str) -> str:
        return validate_password_length(value)
