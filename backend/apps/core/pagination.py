from rest_framework.pagination import CursorPagination

from .config import config


class ConfigCursorPagination(CursorPagination):
    """Cursor pagination with a page size from `content.page_size`."""

    ordering = "-created_at"
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_page_size(self, request):
        self.page_size = config.get_int("content.page_size", 30)
        return super().get_page_size(request)


class IdCursorPagination(ConfigCursorPagination):
    ordering = "-id"
