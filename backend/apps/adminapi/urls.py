from django.urls import path
from rest_framework.routers import DefaultRouter

from . import catalog_views as cv
from . import config_views as cfg

router = DefaultRouter(trailing_slash=False)
router.include_root_view = False
router.register("titles", cv.TitleViewSet, basename="admin-titles")
router.register("seasons", cv.SeasonViewSet, basename="admin-seasons")
router.register("episodes", cv.EpisodeViewSet, basename="admin-episodes")
router.register("related", cv.RelatedLinkViewSet, basename="admin-related")
router.register("genres", cv.GenreViewSet, basename="admin-genres")
router.register("collections", cv.CollectionViewSet, basename="admin-collections")
router.register("home-rows", cv.HomeRowViewSet, basename="admin-home-rows")
router.register("billboards", cv.BillboardViewSet, basename="admin-billboards")
router.register("images", cv.ImageViewSet, basename="admin-images")

urlpatterns = [
    path("title-picker", cv.TitlePickerView.as_view(), name="admin-title-picker"),
    path("config", cfg.ConfigListView.as_view(), name="admin-config"),
    path("config/<str:key>", cfg.ConfigEntryView.as_view(), name="admin-config-entry"),
    path("config/<str:key>/history", cfg.ConfigHistoryView.as_view(), name="admin-config-history"),
    path("storage/test", cfg.StorageTestView.as_view(), name="admin-storage-test"),
    path("storage/apply-cors", cfg.StorageCorsView.as_view(), name="admin-storage-cors"),
    path("cdn/test", cfg.CdnTestView.as_view(), name="admin-cdn-test"),
    path("legal", cfg.LegalPagesView.as_view(), name="admin-legal"),
    path("legal/<slug:slug>", cfg.LegalPageView.as_view(), name="admin-legal-page"),
    *router.urls,
]
