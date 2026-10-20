from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsViewer
from apps.catalog.models import Title
from apps.catalog.queries import cards_by_ids, translation_mode, viewer_state, visible_titles
from apps.catalog.serializers import TitleCardSerializer
from apps.recommendations.cache import invalidate_user

from .models import MyListItem, Rating


class MyListView(APIView):
    permission_classes = [IsViewer]

    @extend_schema(
        parameters=[
            OpenApiParameter("translation", str, enum=["translated", "not_translated", "all"])
        ],
        responses=TitleCardSerializer(many=True),
        operation_id="my_list",
    )
    def get(self, request):
        mode = translation_mode(request)
        ids = list(
            MyListItem.objects.filter(user=request.user, title__in=visible_titles(mode))
            .order_by("-created_at")
            .values_list("title_id", flat=True)[:500]
        )
        return Response(
            TitleCardSerializer(
                cards_by_ids(ids), many=True, context={"viewer": viewer_state(request.user, ids)}
            ).data
        )


class MyListItemView(APIView):
    permission_classes = [IsViewer]

    @extend_schema(request=None, responses={204: None}, operation_id="my_list_add")
    def put(self, request, title_id: int):
        title = get_object_or_404(Title.objects.published(), pk=title_id)
        try:
            MyListItem.objects.get_or_create(user=request.user, profile=None, title=title)
        except IntegrityError:
            pass
        invalidate_user(request.user.pk)
        return Response(status=204)

    @extend_schema(responses={204: None}, operation_id="my_list_remove")
    def delete(self, request, title_id: int):
        MyListItem.objects.filter(user=request.user, title_id=title_id).delete()
        invalidate_user(request.user.pk)
        return Response(status=204)


class RatingInputSerializer(serializers.Serializer):
    value = serializers.ChoiceField(choices=[-1, 1, 2])


class RatingResultSerializer(serializers.Serializer):
    title_id = serializers.IntegerField()
    value = serializers.IntegerField(allow_null=True)


class RatingView(APIView):
    """One tap: 👎 -1 · 👍 1 · 👍👍 2. Recommendations react on the next request."""

    permission_classes = [IsViewer]

    @extend_schema(
        request=RatingInputSerializer, responses=RatingResultSerializer, operation_id="rate_title"
    )
    def put(self, request, title_id: int):
        title = get_object_or_404(Title.objects.published(), pk=title_id)
        data = RatingInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        Rating.objects.update_or_create(
            user=request.user,
            profile=None,
            title=title,
            defaults={"value": data.validated_data["value"]},
        )
        invalidate_user(request.user.pk)
        return Response({"title_id": title.pk, "value": data.validated_data["value"]})

    @extend_schema(responses=RatingResultSerializer, operation_id="unrate_title")
    def delete(self, request, title_id: int):
        Rating.objects.filter(user=request.user, title_id=title_id).delete()
        invalidate_user(request.user.pk)
        return Response({"title_id": title_id, "value": None})
