import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/search_suggestions.dart';
import '../../api/generated/models/title_card.dart';
import '../../brand/netfly_loader.dart';
import '../../core/http.dart';
import '../../core/theme.dart';
import '../../core/viewer_prefs.dart';
import '../../data/catalog.dart';
import '../../widgets/state_message.dart';
import '../../widgets/title_card.dart';
import '../shell/shell.dart';

final _suggestionsProvider = FutureProvider.autoDispose<SearchSuggestions>((ref) {
  return ref
      .watch(apiProvider)
      .search
      .searchSuggestions(translation: translationOf(ref.watch(translationModeProvider)));
});

/// Instant search (debounced): recent searches and Top searches while empty, then results with
/// "Explore titles related to:" terms — as the web's search page.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  Timer? _debounce;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _input.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () => setState(() => _query = value.trim()));
    setState(() {});
  }

  void _set(String q) {
    _input.text = q;
    _input.selection = TextSelection.collapsed(offset: q.length);
    setState(() => _query = q);
  }

  @override
  Widget build(BuildContext context) {
    listenForTabReselect(ref, 2, _scroll);
    final t = NetflyTheme.of(context);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: NetflySpace.gutter,
        title: TextField(
          controller: _input,
          focusNode: _focus,
          onChanged: _onChanged,
          onSubmitted: (q) => ref.read(viewerPrefsProvider.notifier).rememberSearch(q),
          textInputAction: TextInputAction.search,
          style: NetflyType.body.copyWith(color: t.text),
          decoration: InputDecoration(
            hintText: 'Search titles, people, genres',
            hintStyle: NetflyType.body.copyWith(color: t.subtle),
            filled: true,
            fillColor: t.elevated,
            prefixIcon: Icon(Icons.search_rounded, color: t.muted),
            suffixIcon: _input.text.isEmpty
                ? null
                : IconButton(tooltip: 'Clear search', icon: const Icon(Icons.close_rounded), onPressed: () => _set('')),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: BorderSide.none),
            contentPadding: const EdgeInsets.symmetric(vertical: 10),
          ),
        ),
      ),
      body: _query.isEmpty
          ? _Empty(scroll: _scroll, onPick: _set)
          : _Results(query: _query, scroll: _scroll, onTerm: _set),
    );
  }
}

class _Empty extends ConsumerWidget {
  const _Empty({required this.scroll, required this.onPick});
  final ScrollController scroll;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final recent = ref.watch(viewerPrefsProvider.select((p) => p.recentSearches));
    final suggestions = ref.watch(_suggestionsProvider).value;
    return ListView(
      controller: scroll,
      padding: const EdgeInsets.only(bottom: NetflySpace.tabBar + 32),
      children: [
        if (recent.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 12, 8, 4),
            child: Row(
              children: [
                Expanded(
                  child: Text('Recent searches', style: NetflyType.h2.copyWith(color: t.text)),
                ),
                TextButton(
                  onPressed: () => ref.read(viewerPrefsProvider.notifier).clearSearches(),
                  child: const Text('Clear'),
                ),
              ],
            ),
          ),
          for (final q in recent)
            ListTile(leading: const Icon(Icons.history_rounded), title: Text(q), onTap: () => onPick(q)),
        ],
        Padding(
          padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 16, NetflySpace.gutter, 8),
          child: Text('Top searches', style: NetflyType.h2.copyWith(color: t.text)),
        ),
        if (suggestions == null)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: NetflyLoader()),
          )
        else
          for (final item in suggestions.topTitles) _ResultTile(item: item),
      ],
    );
  }
}

class _Results extends ConsumerWidget {
  const _Results({required this.query, required this.scroll, required this.onTerm});
  final String query;
  final ScrollController scroll;
  final ValueChanged<String> onTerm;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final results = ref.watch(searchProvider(query));
    return switch (results) {
      AsyncData(:final value) when value.results.isEmpty => StateMessage(
        title: 'No results for “$query”',
        body: 'Try a different title, actor or genre.',
        icon: Icons.search_off_rounded,
      ),
      AsyncData(:final value) => ListView(
        controller: scroll,
        padding: const EdgeInsets.only(bottom: NetflySpace.tabBar + 32),
        children: [
          if (value.related.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 8, NetflySpace.gutter, 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text('Explore titles related to:', style: NetflyType.meta.copyWith(color: t.muted)),
                  for (final term in value.related)
                    ActionChip(
                      label: Text(term.label),
                      onPressed: () => onTerm(term.label),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
            ),
          for (final item in value.results)
            _ResultTile(item: item, onOpen: () => ref.read(viewerPrefsProvider.notifier).rememberSearch(query)),
        ],
      ),
      AsyncError(:final error) => StateMessage.error(error, onRetry: () => ref.invalidate(searchProvider(query))),
      _ => const Center(child: NetflyLoader(label: 'Searching…')),
    };
  }
}

class _ResultTile extends StatelessWidget {
  const _ResultTile({required this.item, this.onOpen});
  final TitleCard item;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Semantics(
      button: true,
      label: item.title,
      excludeSemantics: true,
      child: InkWell(
        onTap: () {
          onOpen?.call();
          openTitle(context, item, row: 'search');
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              SizedBox(
                width: 146,
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Hero(
                    tag: heroTag(item, 'search'),
                    child: CardArt(title: item),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item.title,
                  style: NetflyType.body.copyWith(fontWeight: FontWeight.w600, color: t.text),
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(right: 12),
                child: Icon(Icons.play_circle_outline_rounded, size: 32),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
