from django.urls import path

from . import views

urlpatterns = [
    path("browse/home", views.HomeView.as_view(), name="browse-home"),
    path("browse/billboard", views.BillboardView.as_view(), name="browse-billboard"),
    path("catalog/poster-wall", views.PosterWallView.as_view(), name="poster-wall"),
    path("titles/<slug:slug>", views.TitlePageView.as_view(), name="title-detail"),
    path(
        "titles/<slug:slug>/seasons/<int:number>/episodes",
        views.EpisodesView.as_view(),
        name="title-episodes",
    ),
    path("genres", views.GenresView.as_view(), name="genres"),
    path("genres/<slug:slug>/titles", views.GenreTitlesView.as_view(), name="genre-titles"),
    path("search", views.SearchView.as_view(), name="search"),
    path("search/suggestions", views.SearchSuggestionsView.as_view(), name="search-suggestions"),
]
