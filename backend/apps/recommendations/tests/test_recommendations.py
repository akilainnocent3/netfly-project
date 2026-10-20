import pytest

from apps.catalog.services import link_related
from apps.core.config import config
from apps.engagement.models import Rating, WatchProgress
from apps.recommendations import engine
from apps.recommendations.tasks import refresh_popularity
from tests.factories import GenreFactory, TitleFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def world():
    drama, action = GenreFactory(name="Drama", slug="drama"), GenreFactory(
        name="Action", slug="action"
    )
    titles = {}
    for name, genre in [
        ("A", drama),
        ("B", action),
        ("C", drama),
        ("D", action),
        ("E", action),
        ("F", drama),
        ("G", action),
        ("H", drama),
    ]:
        titles[name] = TitleFactory(title=name, translation_status="translated")
        titles[name].genres.add(genre)
    return titles


def rows(api, mode="translated"):
    return api.get(f"/api/v1/browse/home?translation={mode}").json()["rows"]


def test_cold_start_is_stable_per_user_per_day(world):
    u1, u2 = UserFactory(), UserFactory()
    first, _ = engine.score(u1.pk, "translated")
    again, _ = engine.score(u1.pk, "translated")
    other, _ = engine.score(u2.pk, "translated")
    assert first == again
    assert sorted(first) == sorted(other) and len(first) == 8


def test_related_titles_are_the_strongest_signal(world):
    user = UserFactory()
    link_related(world["A"], world["B"], 5)  # B: different genre, but admin-related
    Rating.objects.create(user=user, title=world["A"], value=Rating.Value.LOVE)
    ranked, scores = engine.score(user.pk, "translated")
    assert ranked[0] == world["B"].pk
    assert (
        scores[world["B"].pk] > scores[world["C"].pk] > scores[world["D"].pk]
    )  # related > shared genre > neither
    assert world["A"].pk not in ranked  # the seed itself isn't recommended back


def test_dislikes_push_related_titles_down_and_are_excluded(world):
    user = UserFactory()
    link_related(world["D"], world["E"], 5)
    Rating.objects.create(user=user, title=world["C"], value=Rating.Value.LIKE)
    Rating.objects.create(user=user, title=world["D"], value=Rating.Value.DISLIKE)
    ranked, scores = engine.score(user.pk, "translated")
    assert world["D"].pk not in ranked
    assert (
        scores[world["E"].pk] < scores[world["G"].pk]
    )  # same genre, but E is related to the dislike


def test_completed_titles_are_excluded_from_discovery(world):
    user = UserFactory()
    WatchProgress.objects.create(
        user=user, title=world["F"], completed=True, duration_seconds=600, watch_seconds=580
    )
    ranked, _ = engine.score(user.pk, "translated")
    assert world["F"].pk not in ranked
    signals = engine.load_signals(user.pk)
    assert world["F"].pk in signals.seeds and signals.seeds[world["F"].pk].reason == "watched"


def test_recency_decay(world):
    import datetime as dt

    from django.utils import timezone

    user = UserFactory()
    old = Rating.objects.create(user=user, title=world["A"], value=Rating.Value.LIKE)
    Rating.objects.filter(pk=old.pk).update(updated_at=timezone.now() - dt.timedelta(days=60))
    Rating.objects.create(user=user, title=world["B"], value=Rating.Value.LIKE)
    seeds = engine.load_signals(user.pk).seeds
    assert seeds[world["B"].pk].strength == pytest.approx(1.0, abs=0.01)
    assert seeds[world["A"].pk].strength == pytest.approx(0.25, abs=0.02)  # two half-lives


def test_exploration_mixes_in_random_titles():
    ranked = list(range(1, 21))
    pool = list(range(1, 101))
    config.set("recommendations.exploration_ratio", 0.2)
    mixed = engine.with_exploration(ranked, pool, user_id=1, limit=20, salt="t")
    assert len(mixed) == 20 and len(set(mixed) - set(ranked)) == 4
    assert mixed[0] == 1  # the best pick stays first


def test_because_you_liked_appears_immediately_after_a_like(auth_api, world):
    link_related(world["A"], world["B"], 5)
    assert not any(r["kind"] == "because_you_liked" for r in rows(auth_api))  # cached feed warmed
    assert (
        auth_api.put(f"/api/v1/ratings/{world['A'].pk}", {"value": 1}, format="json").status_code
        == 200
    )
    byl = next(r for r in rows(auth_api) if r["kind"] == "because_you_liked")
    assert byl["title"] == "Because you liked A"
    assert byl["items"][0]["id"] == world["B"].pk
    top = next(r for r in rows(auth_api) if r["kind"] == "top_picks")
    assert all(isinstance(i["match"], int) for i in top["items"])


def test_not_for_me_removes_title_from_rows(auth_api, world):
    seen = {i["id"] for r in rows(auth_api) if r["kind"] == "top_picks" for i in r["items"]}
    assert world["H"].pk in seen
    auth_api.put(f"/api/v1/ratings/{world['H'].pk}", {"value": -1}, format="json")
    after = {
        i["id"]
        for r in rows(auth_api)
        if r["kind"] in ("top_picks", "because_you_liked")
        for i in r["items"]
    }
    assert world["H"].pk not in after
    auth_api.delete(f"/api/v1/ratings/{world['H'].pk}")  # Undo
    assert world["H"].pk in {
        i["id"] for r in rows(auth_api) if r["kind"] == "top_picks" for i in r["items"]
    }


def test_recommendations_respect_translation_filter(auth_api, world):
    original = TitleFactory(title="Original", translation_status="not_translated")
    link_related(world["A"], original, 5)
    auth_api.put(f"/api/v1/ratings/{world['A'].pk}", {"value": 2}, format="json")
    items = [i for r in rows(auth_api, "translated") for i in r["items"]]
    assert original.pk not in {i["id"] for i in items}
    assert all(i["translation_status"] == "translated" for i in items)


def test_weights_come_from_config(world):
    user = UserFactory()
    link_related(world["A"], world["B"], 5)
    Rating.objects.create(user=user, title=world["A"], value=Rating.Value.LIKE)
    config.set("recommendations.weight_related", 0.0)
    config.set("recommendations.weight_genre", 5.0)
    ranked, _ = engine.score(user.pk, "translated")
    assert ranked[0] in {world["C"].pk, world["F"].pk, world["H"].pk}  # genre now dominates


def test_refresh_popularity(world):
    users = [UserFactory() for _ in range(3)]
    for u in users:
        WatchProgress.objects.create(
            user=u, title=world["A"], position_seconds=10, duration_seconds=100
        )
    Rating.objects.create(user=users[0], title=world["A"], value=1)
    refresh_popularity()
    world["A"].refresh_from_db()
    world["B"].refresh_from_db()
    assert world["A"].popularity > world["B"].popularity == 0
    assert world["A"].trending >= 3
