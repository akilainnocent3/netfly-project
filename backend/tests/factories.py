import factory
from django.utils import timezone

from apps.accounts.models import User
from apps.catalog.models import Episode, Genre, Season, Title
from apps.media.models import ImageAsset, VideoAsset


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user_{n}")
    full_name = factory.Faker("name")
    password = factory.PostGenerationMethodCall("set_password", "correct-horse")


class ImageFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ImageAsset

    kind = "poster"
    status = ImageAsset.Status.READY
    original_key = factory.Sequence(lambda n: f"netfly/images/{n}/original.jpg")
    widths = [160, 320, 640]
    formats = ["webp"]
    width = 640
    height = 960
    blur_data_url = "data:image/webp;base64,AAAA"


class VideoFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = VideoAsset

    status = VideoAsset.Status.READY
    duration = 600
    source_width = 1920
    source_height = 1080
    hls_prefix = factory.Sequence(lambda n: f"netfly/hls/{n}")
    renditions = [
        {
            "name": "1080p",
            "height": 1080,
            "width": 1920,
            "bandwidth": 5500000,
            "avg_bandwidth": 5000000,
            "codecs": "avc1.640028",
            "playlist": "v0/index.m3u8",
            "frame_rate": 24,
        },
        {
            "name": "480p",
            "height": 480,
            "width": 854,
            "bandwidth": 1500000,
            "avg_bandwidth": 1400000,
            "codecs": "avc1.64001f",
            "playlist": "v1/index.m3u8",
            "frame_rate": 24,
        },
    ]
    audio_tracks = [
        {
            "name": "Default",
            "language": "en",
            "bandwidth": 160000,
            "codecs": "mp4a.40.2",
            "playlist": "a0/index.m3u8",
            "channels": "2",
        }
    ]


class GenreFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Genre

    name = factory.Sequence(lambda n: f"Genre {n}")
    slug = factory.Sequence(lambda n: f"genre-{n}")


class TitleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Title

    type = Title.Type.MOVIE
    title = factory.Sequence(lambda n: f"Title {n}")
    slug = factory.Sequence(lambda n: f"title-{n}")
    synopsis = "A story."
    year = 2024
    maturity_rating = "PG-13"
    runtime_minutes = 110
    translation_status = "translated"
    rights_holder = "Rights Co"
    status = Title.Status.PUBLISHED
    published_at = factory.LazyFunction(timezone.now)
    poster = factory.SubFactory(ImageFactory, kind="poster")
    backdrop = factory.SubFactory(ImageFactory, kind="backdrop", width=1920, height=1080)
    video = factory.SubFactory(VideoFactory)


class SeriesFactory(TitleFactory):
    type = Title.Type.SERIES
    video = None
    runtime_minutes = None


class SeasonFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Season

    title = factory.SubFactory(SeriesFactory)
    number = factory.Sequence(lambda n: n + 1)


class EpisodeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Episode

    season = factory.SubFactory(SeasonFactory)
    number = factory.Sequence(lambda n: n + 1)
    name = factory.Sequence(lambda n: f"Episode {n}")
    runtime_minutes = 42
    video = factory.SubFactory(VideoFactory, kind="episode")
