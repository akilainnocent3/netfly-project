import datetime as dt
import re
import time as real_time
from zoneinfo import ZoneInfo

import pytest

from apps.billing import usage
from apps.billing.models import Plan, Subscription, UsageLedger
from apps.billing.plans import ensure_subscription
from apps.core.config import config
from apps.core.redis import get_redis
from tests.factories import TitleFactory

pytestmark = pytest.mark.django_db
DAR = ZoneInfo("Africa/Dar_es_Salaam")


@pytest.fixture
def clock(monkeypatch):
    state = {"now": real_time.time()}
    monkeypatch.setattr(usage.time, "time", lambda: state["now"])
    return state


def start(api, title=None):
    title = title or TitleFactory()
    res = api.get(f"/api/v1/playback/{title.slug}")
    assert res.status_code == 200, res.json()
    return res.json()["session_id"]


def beat(api, sid, watched, playing=True):
    return api.post(
        "/api/v1/playback/heartbeat",
        {"session_id": sid, "watched": watched, "playing": playing},
        format="json",
    )


def test_every_new_account_starts_on_the_free_default_plan(user):
    sub = Subscription.objects.get(user=user)
    assert sub.plan.slug == "bure" and sub.status == "free"
    snap = usage.snapshot(user)
    assert snap["limits"] == {"day": 3600, "week": 4 * 3600, "month": 12 * 3600}
    assert snap["allowed"] and snap["remaining_seconds"] == 3600


def test_heartbeat_credits_server_time_not_reported_time(auth_api, clock):
    sid = start(auth_api)
    clock["now"] += 30
    res = beat(auth_api, sid, 30).json()
    assert res["credited"] == 30 and res["used"]["day"] == 30
    clock["now"] += 30
    # 2x speed, or a tampered client claiming an hour: capped at elapsed + tolerance (5 s).
    assert beat(auth_api, sid, 3600).json()["credited"] == 35
    clock["now"] += 30
    assert beat(auth_api, sid, 30, playing=False).json()["credited"] == 0  # paused
    assert UsageLedger.objects.get(session_id=sid).credited_seconds == 65


def test_heartbeats_need_a_session_issued_to_this_user(auth_api, api, clock):
    assert beat(auth_api, "f" * 32, 30).json()["code"] == "invalid_session"
    sid = start(auth_api)
    from apps.accounts.models import User
    from apps.accounts.tokens import issue_access_token

    other = User.objects.create_user("intruder", "correct-horse")
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_access_token(other)[0]}")
    clock["now"] += 30
    assert beat(api, sid, 30).status_code == 409
    assert UsageLedger.objects.count() == 0


def test_a_lapsed_lease_credits_nothing_it_did_not_see(auth_api, clock):
    sid = start(auth_api)
    get_redis().delete(f"usage:lease:{sid}")  # device slept for an hour
    clock["now"] += 3600
    assert beat(auth_api, sid, 3600).json()["credited"] == 5  # tolerance only
    clock["now"] += 30
    assert beat(auth_api, sid, 30).json()["credited"] == 30


def test_concurrent_streams_each_count(auth_api, clock):
    a, b = start(auth_api), start(auth_api)
    clock["now"] += 30
    beat(auth_api, a, 30)
    res = beat(auth_api, b, 30).json()
    assert res["used"]["day"] == 60


def test_limit_blocks_new_sessions_and_heartbeats_say_stop(auth_api, clock):
    plan = Plan.objects.get(slug="bure")
    plan.daily_limit_minutes = 1
    plan.save()
    sid = start(auth_api)
    clock["now"] += 61
    res = beat(auth_api, sid, 61).json()
    assert res["allowed"] is False and res["limit_reached"] == "day"
    blocked = auth_api.get(f"/api/v1/playback/{TitleFactory().slug}")
    assert blocked.status_code == 403
    body = blocked.json()
    assert body["code"] == "usage_limit_reached"
    assert body["usage"]["remaining"]["day"] == 0
    # Previews (muted hover / hero) are never metered or blocked.
    assert auth_api.get(f"/api/v1/playback/{TitleFactory().slug}?preview=1").status_code == 200


def test_plan_edits_apply_to_everyone_on_the_plan_at_once(auth_api, clock):
    sid = start(auth_api)
    clock["now"] += 30
    beat(auth_api, sid, 30)
    Plan.objects.filter(slug="bure").update(daily_limit_minutes=5)
    snap = auth_api.get("/api/v1/billing/usage").json()
    assert snap["limits"]["day"] == 300 and snap["remaining"]["day"] == 270


def test_staff_are_exempt(staff_api, clock):
    Plan.objects.filter(slug="bure").update(daily_limit_minutes=1)
    sid = start(staff_api)
    clock["now"] += 120
    res = beat(staff_api, sid, 120).json()
    assert res["exempt"] and res["allowed"] and res["remaining"]["day"] is None
    assert staff_api.get(f"/api/v1/playback/{TitleFactory().slug}").status_code == 200


def test_windows_reset_at_local_midnight_week_start_and_month():
    config.set("usage.week_starts_on", "monday")
    late = dt.datetime(2026, 10, 21, 23, 59, tzinfo=DAR)  # a Wednesday
    w = usage.windows(None, late)
    assert w["day"].end == dt.datetime(2026, 10, 22, tzinfo=DAR)
    assert w["week"].start == dt.datetime(2026, 10, 19, tzinfo=DAR)
    assert w["week"].end == dt.datetime(2026, 10, 26, tzinfo=DAR)
    assert w["month"].end == dt.datetime(2026, 11, 1, tzinfo=DAR)
    after = usage.windows(None, late + dt.timedelta(minutes=2))
    assert after["day"].key != w["day"].key and after["week"].key == w["week"].key
    config.set("usage.week_starts_on", "sunday")
    assert usage.windows(None, late)["week"].start == dt.datetime(2026, 10, 18, tzinfo=DAR)


def test_billing_period_month(user):
    config.set("usage.monthly_reset", "billing_period")
    sub = ensure_subscription(user)
    sub.plan = Plan.objects.get(slug="pendwa")
    sub.status = "active"
    sub.current_period_start = dt.datetime(2026, 10, 5, 12, tzinfo=dt.UTC)
    sub.current_period_end = dt.datetime(2026, 11, 4, 12, tzinfo=dt.UTC)
    sub.save()
    w = usage.windows(sub, dt.datetime(2026, 10, 21, tzinfo=dt.UTC))
    assert w["month"].start == sub.current_period_start and w["month"].end == sub.current_period_end


def test_usage_rolls_over_at_midnight(auth_api, clock, monkeypatch):
    from django.utils import timezone

    first = dt.datetime(2026, 10, 21, 23, 59, 30, tzinfo=DAR)
    monkeypatch.setattr(timezone, "now", lambda: first)
    sid = start(auth_api)
    clock["now"] += 20
    assert beat(auth_api, sid, 20).json()["used"]["day"] == 20
    monkeypatch.setattr(timezone, "now", lambda: first + dt.timedelta(minutes=1))
    clock["now"] += 20
    snap = beat(auth_api, sid, 20).json()
    assert snap["used"]["day"] == 20 and snap["used"]["week"] == 40
    assert UsageLedger.objects.filter(session_id=sid).count() == 2


def test_counters_rebuild_from_the_ledger(auth_api, clock):
    sid = start(auth_api)
    clock["now"] += 30
    beat(auth_api, sid, 30)
    for key in get_redis().scan_iter(match="usage:*:day:*"):
        get_redis().delete(key)
    for key in get_redis().scan_iter(match="usage:*:week:*"):
        get_redis().delete(key)
    clock["now"] += 30
    snap = beat(auth_api, sid, 30).json()
    assert snap["used"]["day"] == 60 and snap["used"]["week"] == 60 and snap["used"]["month"] == 60


def test_bonus_and_reset(user, staff):
    Plan.objects.filter(slug="bure").update(daily_limit_minutes=10)
    usage.grant_bonus(user, 15, "day", actor=staff)
    assert usage.snapshot(user)["limits"]["day"] == 25 * 60


def test_purge_stale_keys():
    r = get_redis()
    r.set("usage:1:day:d2020-01-01", 5)
    r.set(f"usage:1:day:d{dt.date.today().isoformat()}", 5)
    assert usage.purge_stale_keys() == 1
    assert r.get(f"usage:1:day:d{dt.date.today().isoformat()}") is not None


def test_spent_allowance_stops_loading_playlists(auth_api, clock):
    plan = Plan.objects.get(slug="bure")
    plan.daily_limit_minutes = 1
    plan.save()
    title = TitleFactory()
    info = auth_api.get(f"/api/v1/playback/{title.slug}").json()
    master = info["master_url"]
    assert auth_api.get(master).status_code == 200
    preview = auth_api.get(f"/api/v1/playback/{title.slug}?preview=1").json()["master_url"]
    clock["now"] += 61
    beat(auth_api, info["session_id"], 61)
    # A client that ignores the heartbeat can't load (or switch) renditions any more…
    blocked = auth_api.get(master)
    assert blocked.status_code == 403 and blocked.json()["code"] == "usage_limit_reached"
    # …while muted previews keep working (browsing is never restricted).
    assert auth_api.get(preview).status_code == 200


def test_preview_token_keeps_its_height_cap(auth_api):
    title = TitleFactory()
    preview = auth_api.get(f"/api/v1/playback/{title.slug}?preview=1").json()["master_url"]
    body = auth_api.get(preview.replace("&max_height=720", "")).content.decode()
    heights = re.findall(r"RESOLUTION=\d+x(\d+)", body)
    assert heights and max(map(int, heights)) <= 720
