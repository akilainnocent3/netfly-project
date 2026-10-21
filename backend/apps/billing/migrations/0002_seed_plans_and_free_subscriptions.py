from django.db import migrations

QUALITY = "Best video quality (same on every plan)"

PLANS = [
    {
        "slug": "bure",
        "name": "Bure",
        "tagline": "Watch for free, every day.",
        "price_tzs": 0,
        "daily_limit_minutes": 60,
        "weekly_limit_minutes": 240,
        "monthly_limit_minutes": 720,
        "is_free": True,
        "is_default": True,
        "trial_eligible": False,
        "order": 0,
        "feature_bullets": [QUALITY, "Every title in the catalog", "No payment needed"],
    },
    {
        "slug": "mwanzo",
        "name": "Mwanzo",
        "tagline": "More time for the shows you love.",
        "price_tzs": 1500,
        "daily_limit_minutes": 120,
        "weekly_limit_minutes": 600,
        "monthly_limit_minutes": 2100,
        "trial_eligible": True,
        "order": 1,
        "feature_bullets": [QUALITY, "Every title in the catalog", "Pay with mobile money"],
    },
    {
        "slug": "pendwa",
        "name": "Pendwa",
        "tagline": "Our most popular plan.",
        "price_tzs": 2500,
        "daily_limit_minutes": 240,
        "weekly_limit_minutes": 1200,
        "monthly_limit_minutes": 4200,
        "trial_eligible": True,
        "highlight_label": "Most popular",
        "order": 2,
        "feature_bullets": [QUALITY, "Every title in the catalog", "Pay with mobile money"],
    },
    {
        "slug": "kinara",
        "name": "Kinara",
        "tagline": "For the whole household.",
        "price_tzs": 5000,
        "daily_limit_minutes": 360,
        "weekly_limit_minutes": 2100,
        "monthly_limit_minutes": 7200,
        "trial_eligible": True,
        "order": 3,
        "feature_bullets": [QUALITY, "Every title in the catalog", "Pay with mobile money"],
    },
]


def seed(apps, schema_editor):
    Plan = apps.get_model("billing", "Plan")
    Subscription = apps.get_model("billing", "Subscription")
    User = apps.get_model("accounts", "User")
    for spec in PLANS:
        Plan.objects.get_or_create(slug=spec["slug"], defaults=spec)
    free = Plan.objects.get(is_default=True)
    have = set(Subscription.objects.values_list("user_id", flat=True))
    Subscription.objects.bulk_create(
        [
            Subscription(user_id=pk, plan=free, status="free")
            for pk in User.objects.exclude(pk__in=have).values_list("pk", flat=True)
        ],
        batch_size=1000,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("billing", "0001_initial"),
        ("accounts", "0003_contact_details_and_remember_me"),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
