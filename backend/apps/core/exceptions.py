"""Every error leaves the API as `{code, message, fields?}`."""

import logging

from django.core.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler

logger = logging.getLogger(__name__)


class APIError(exceptions.APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "bad_request"
    default_detail = "Something went wrong."

    def __init__(
        self, message: str, code: str | None = None, status_code: int | None = None, fields=None
    ):
        super().__init__(message, code)
        self.error_code = code or self.default_code
        if status_code:
            self.status_code = status_code
        self.fields = fields


def _first(value):
    if isinstance(value, list):
        return str(value[0]) if value else ""
    if isinstance(value, dict):
        return {k: _first(v) for k, v in value.items()}
    return str(value)


def exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()
    elif isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(
            exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        )

    response = drf_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error", exc_info=exc)
        return Response(
            {
                "code": "server_error",
                "message": "Something went wrong on our side. Please try again.",
            },
            status=500,
        )

    if isinstance(exc, APIError):
        body = {"code": exc.error_code, "message": str(exc.detail)}
        if exc.fields:
            body["fields"] = exc.fields
    elif isinstance(exc, exceptions.ValidationError):
        detail = exc.detail
        if isinstance(detail, dict):
            fields = {k: _first(v) for k, v in detail.items() if k != "non_field_errors"}
            non_field = detail.get("non_field_errors")
            message = (
                _first(non_field)
                if non_field
                else (
                    next(iter(fields.values()), "Please check the highlighted fields.")
                    if fields
                    else "Invalid input."
                )
            )
            if isinstance(message, dict):
                message = "Please check the highlighted fields."
            body = {"code": "validation_error", "message": message}
            if fields:
                body["fields"] = fields
        else:
            body = {"code": "validation_error", "message": _first(detail)}
    elif isinstance(exc, exceptions.Throttled):
        wait = int(exc.wait or 1)
        body = {
            "code": "rate_limited",
            "message": f"Too many attempts. Try again in {wait} seconds.",
        }
    else:
        code = exc.get_codes() if hasattr(exc, "get_codes") else "error"
        body = {"code": code if isinstance(code, str) else "error", "message": _first(exc.detail)}

    response.data = body
    return response
