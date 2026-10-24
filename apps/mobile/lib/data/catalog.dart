import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/generated/models/billboard_item.dart';
import '../api/generated/models/episode.dart';
import '../api/generated/models/genre_page.dart';
import '../api/generated/models/genre_tile.dart';
import '../api/generated/models/home_page.dart';
import '../api/generated/models/new_and_popular.dart';
import '../api/generated/models/search_response.dart';
import '../api/generated/models/sort.dart';
import '../api/generated/models/title_card.dart';
import '../api/generated/models/title_page.dart';
import '../api/generated/models/translation.dart';
import '../api/generated/models/type.dart';
import '../core/http.dart';
import '../core/session.dart';
import '../core/viewer_prefs.dart';

Translation translationOf(String mode) => switch (mode) {
  'not_translated' => Translation.notTranslated,
  'all' => Translation.all,
  _ => Translation.translated,
};

/// Feeds re-load when the viewer, profile or translation mode changes (as the web's query keys).
String _viewerKey(Ref ref) =>
    '${ref.watch(userProvider)?.id}.${ref.watch(viewerPrefsProvider.select((p) => p.profileId))}';

typedef FeedKey = ({String? kind});

final billboardProvider = FutureProvider.autoDispose.family<List<BillboardItem>, FeedKey>((ref, key) {
  _viewerKey(ref);
  final mode = ref.watch(translationModeProvider);
  return ref
      .watch(apiProvider)
      .browse
      .browseBillboard(
        translation: translationOf(mode),
        type: key.kind == null ? null : (key.kind == 'series' ? Type.series : Type.movie),
      );
});

/// The infinite home feed: pages of rows, fetched as the viewer scrolls.
class HomeFeed extends AsyncNotifier<List<HomePage>> {
  HomeFeed(this.kind);

  final String? kind;
  bool _loadingMore = false;

  Future<HomePage> _page(String? cursor) {
    final mode = ref.read(translationModeProvider);
    return ref
        .read(apiProvider)
        .browse
        .browseHome(
          cursor: cursor,
          translation: translationOf(mode),
          type: kind == null ? null : (kind == 'series' ? Type.series : Type.movie),
        );
  }

  @override
  Future<List<HomePage>> build() async {
    _viewerKey(ref);
    ref.watch(translationModeProvider);
    return [await _page(null)];
  }

  bool get hasMore => state.value?.last.next != null;

  Future<void> loadMore() async {
    final pages = state.value;
    if (_loadingMore || pages == null || pages.last.next == null) return;
    _loadingMore = true;
    try {
      final next = await _page(pages.last.next);
      state = AsyncData([...pages, next]);
    } catch (_) {
      // The next scroll retries.
    } finally {
      _loadingMore = false;
    }
  }
}

final homeFeedProvider = AsyncNotifierProvider.autoDispose.family<HomeFeed, List<HomePage>, String?>(HomeFeed.new);

final newAndPopularProvider = FutureProvider.autoDispose<NewAndPopular>((ref) {
  _viewerKey(ref);
  return ref
      .watch(apiProvider)
      .browse
      .browseNewAndPopular(translation: translationOf(ref.watch(translationModeProvider)));
});

final titleProvider = FutureProvider.autoDispose.family<TitlePage, String>((ref, slug) {
  _viewerKey(ref);
  return ref
      .watch(apiProvider)
      .titles
      .titleDetail(slug: slug, translation: translationOf(ref.watch(translationModeProvider)));
});

final genresProvider = FutureProvider.autoDispose<List<GenreTile>>((ref) {
  return ref.watch(apiProvider).genres.genres(translation: translationOf(ref.watch(translationModeProvider)));
});

typedef GenreKey = ({String slug, Sort sort});

final genrePageProvider = FutureProvider.autoDispose.family<GenrePage, GenreKey>((ref, key) {
  _viewerKey(ref);
  return ref
      .watch(apiProvider)
      .genres
      .genreTitles(slug: key.slug, sort: key.sort, translation: translationOf(ref.watch(translationModeProvider)));
});

final searchProvider = FutureProvider.autoDispose.family<SearchResponse, String>((ref, q) {
  return ref.watch(apiProvider).search.search(q: q, translation: translationOf(ref.watch(translationModeProvider)));
});

final myListProvider = FutureProvider.autoDispose<List<TitleCard>>((ref) {
  _viewerKey(ref);
  return ref.watch(apiProvider).myList.myList(translation: translationOf(ref.watch(translationModeProvider)));
});

/// A season's episodes (title view and the player's episode drawer).
final episodesProvider = FutureProvider.autoDispose.family<List<Episode>, (String, int)>((ref, key) async {
  final page = await ref.watch(apiProvider).titles.titleEpisodes(slug: key.$1, number: key.$2, limit: 100);
  return page.results;
});
