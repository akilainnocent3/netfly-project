import datetime as dt

from django.db import IntegrityError
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import ViewerProfile
from apps.accounts.permissions import IsViewer
from apps.accounts.viewer import viewer_for
from apps.catalog import badges
from apps.catalog.models import Title
from apps.catalog.queries import (
    badge_context,
    cards_by_ids,
    translation_mode,
    upcoming_titles,
    viewer_state,
    visible_titles,
)
from apps.catalog.serializers import TitleCardSerializer
from apps.core.throttling import throttle
from apps.recommendations.cache import invalidate_viewer

from .models import MyListItem, Rating, Reminder, WatchProgress


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
        who = viewer_for(request)
        ids = list(
            MyListItem.objects.filter(**who.scope, title__in=visible_titles(mode, who.kids))
            .order_by("-created_at")
            .values_list("title_id", flat=True)[:500]
        )
        return Response(
            TitleCardSerializer(
                cards_by_ids(ids),
                many=True,
                context={"viewer": viewer_state(who, ids), "badges": badge_context(mode)},
            ).data
        )


class MyListItemView(APIView):
    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_engagement", per_user=True)]

    @extend_schema(request=None, responses={204: None}, operation_id="my_list_add")
    def put(self, request, title_id: int):
        title = get_object_or_404(Title.objects.published(), pk=title_id)
        who = viewer_for(request)
        try:
            MyListItem.objects.get_or_create(**who.scope, title=title)
        except IntegrityError:
            pass
        invalidate_viewer(who)
        return Response(status=204)

    @extend_schema(responses={204: None}, operation_id="my_list_remove")
    def delete(self, request, title_id: int):
        who = viewer_for(request)
        MyListItem.objects.filter(**who.scope, title_id=title_id).delete()
        invalidate_viewer(who)
        return Response(status=204)


class RatingInputSerializer(serializers.Serializer):
    value = serializers.ChoiceField(choices=[-1, 1, 2])


class RatingResultSerializer(serializers.Serializer):
    title_id = serializers.IntegerField()
    value = serializers.IntegerField(allow_null=True)


class RatingView(APIView):
    """One tap: 👎 -1 · 👍 1 · 👍👍 2. Recommendations react on the next request."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_engagement", per_user=True)]

    @extend_schema(
        request=RatingInputSerializer, responses=RatingResultSerializer, operation_id="rate_title"
    )
    def put(self, request, title_id: int):
        title = get_object_or_404(Title.objects.published(), pk=title_id)
        data = RatingInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        who = viewer_for(request)
        Rating.objects.update_or_create(
            **who.scope, title=title, defaults={"value": data.validated_data["value"]}
        )
        invalidate_viewer(who)
        return Response({"title_id": title.pk, "value": data.validated_data["value"]})

    @extend_schema(responses=RatingResultSerializer, operation_id="unrate_title")
    def delete(self, request, title_id: int):
        who = viewer_for(request)
        Rating.objects.filter(**who.scope, title_id=title_id).delete()
        invalidate_viewer(who)
        return Response({"title_id": title_id, "value": None})


class ContinueWatchingItemView(APIView):
    """ "Remove from row": hides the title from Continue Watching until it is played again."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_engagement", per_user=True)]

    @extend_schema(responses={204: None}, operation_id="continue_watching_remove")
    def delete(self, request, title_id: int):
        who = viewer_for(request)
        WatchProgress.objects.filter(**who.scope, title_id=title_id).update(hidden=True)
        invalidate_viewer(who)
        return Response(status=204)


class ReminderView(APIView):
    """ "Remind me" on a Coming Soon title (per profile when profiles are on)."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_engagement", per_user=True)]

    @extend_schema(request=None, responses={204: None}, operation_id="reminder_add")
    def put(self, request, title_id: int):
        title = get_object_or_404(upcoming_titles(), pk=title_id)
        who = viewer_for(request)
        try:
            Reminder.objects.get_or_create(**who.scope, title=title)
        except IntegrityError:
            pass
        return Response(status=204)

    @extend_schema(responses={204: None}, operation_id="reminder_remove")
    def delete(self, request, title_id: int):
        who = viewer_for(request)
        Reminder.objects.filter(**who.scope, title_id=title_id).delete()
        return Response(status=204)


class NotificationSerializer(serializers.Serializer):
    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=["reminder", "new_episodes", "recently_added"])
    message = serializers.CharField()
    at = serializers.DateTimeField()
    unread = serializers.BooleanField()
    title = TitleCardSerializer()


class NotificationListSerializer(serializers.Serializer):
    unread = serializers.IntegerField()
    results = NotificationSerializer(many=True)


def _seen_at(request, who):
    if who.profile_id:
        return (
            ViewerProfile.objects.filter(pk=who.profile_id)
            .values_list("notifications_seen_at", flat=True)
            .first()
        )
    return request.user.notifications_seen_at


class NotificationsView(APIView):
    """The bell: reminded titles that are out, new episodes of saved series, recent arrivals."""

    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_engagement", per_user=True)]

    @extend_schema(responses=NotificationListSerializer, operation_id="notifications")
    def get(self, request):
        who = viewer_for(request)
        mode = translation_mode(request)
        now = timezone.now()
        window = max(badges.windows().recently_added, dt.timedelta(days=7)) * 2
        since = now - window
        visible = visible_titles(mode, who.kids)
        items: dict[int, tuple[str, str, dt.datetime]] = {}

        for pk, at in Reminder.objects.filter(
            **who.scope, title__in=visible, title__published_at__gte=since
        ).values_list("title_id", "title__published_at"):
            items[pk] = ("reminder", "Now available — you asked us to remind you.", at)

        saved = set(MyListItem.objects.filter(**who.scope).values_list("title_id", flat=True))
        saved |= set(WatchProgress.objects.filter(**who.scope).values_list("title_id", flat=True))
        for pk, at in (
            visible.filter(pk__in=saved, type=Title.Type.SERIES)
            .annotate(latest=Max("seasons__episodes__created_at"))
            .filter(latest__gte=since)
            .values_list("pk", "latest")
        ):
            items.setdefault(pk, ("new_episodes", "New episodes are available.", at))

        for pk, at in (
            visible.filter(published_at__gte=since)
            .order_by("-published_at")
            .values_list("pk", "published_at")[:6]
        ):
            items.setdefault(pk, ("recently_added", "New on Netfly.", at))

        ordered = sorted(items.items(), key=lambda kv: kv[1][2], reverse=True)[:20]
        cards = {t.pk: t for t in cards_by_ids([pk for pk, _ in ordered])}
        seen = _seen_at(request, who)
        context = {"badges": badge_context(mode)}
        results = [
            {
                "id": f"{kind}:{pk}",
                "kind": kind,
                "message": message,
                "at": at,
                "unread": seen is None or at > seen,
                "title": TitleCardSerializer(cards[pk], context=context).data,
            }
            for pk, (kind, message, at) in ordered
            if pk in cards
        ]
        response = Response({"unread": sum(1 for r in results if r["unread"]), "results": results})
        response["Cache-Control"] = "private, no-store"
        return response


class NotificationsSeenView(APIView):
    permission_classes = [IsViewer]
    throttle_classes = [throttle("security.rate_engagement", per_user=True)]

    @extend_schema(request=None, responses={204: None}, operation_id="notifications_seen")
    def post(self, request):
        who = viewer_for(request)
        now = timezone.now()
        if who.profile_id:
            ViewerProfile.objects.filter(pk=who.profile_id, user=request.user).update(
                notifications_seen_at=now
            )
        else:
            type(request.user).objects.filter(pk=request.user.pk).update(notifications_seen_at=now)
        return Response(status=204)
