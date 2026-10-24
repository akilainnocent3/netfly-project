import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/sort.dart';
import '../../brand/netfly_loader.dart';
import '../../core/theme.dart';
import '../../data/catalog.dart';
import '../../widgets/netfly_image.dart';
import '../../widgets/state_message.dart';
import '../../widgets/title_card.dart';

/// A category: its artwork as the header (DECISIONS 57), sort, and the grid of titles.
class CategoryScreen extends ConsumerStatefulWidget {
  const CategoryScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<CategoryScreen> createState() => _CategoryScreenState();
}

class _CategoryScreenState extends ConsumerState<CategoryScreen> {
  Sort _sort = Sort.suggested;
  static const _sorts = [(Sort.suggested, 'Suggested'), (Sort.newest, 'Newest'), (Sort.az, 'A–Z'), (Sort.year, 'Year')];

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final page = ref.watch(genrePageProvider((slug: widget.slug, sort: _sort)));
    final genre = page.value?.genre;
    final items = page.value?.rows.firstOrNull?.items ?? const [];
    final cover = genre == null ? null : genre.artwork ?? genre.sample;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(backgroundColor: Colors.transparent),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: AspectRatio(
              aspectRatio: 16 / 10,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (cover != null) NetflyImage(image: cover) else ColoredBox(color: t.elevated),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [t.bg, t.bg.withValues(alpha: 0.5), Colors.black26],
                      ),
                    ),
                  ),
                  Positioned(
                    left: NetflySpace.gutter,
                    right: NetflySpace.gutter,
                    bottom: 12,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(genre?.name ?? '', style: NetflyType.h1.copyWith(color: t.text)),
                        ),
                        if (genre?.description?.isNotEmpty ?? false)
                          Text(genre!.description!, style: NetflyType.body.copyWith(color: t.muted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter, vertical: 6),
                children: [
                  for (final (sort, label) in _sorts)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(label),
                        selected: _sort == sort,
                        onSelected: (_) => setState(() => _sort = sort),
                      ),
                    ),
                ],
              ),
            ),
          ),
          switch (page) {
            AsyncData() when items.isEmpty => const SliverToBoxAdapter(
              child: StateMessage(
                title: 'Nothing here in this mode',
                body: 'Try the other translation filter at the top of Home.',
                icon: Icons.movie_filter_outlined,
              ),
            ),
            AsyncData() => SliverPadding(
              padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 8, NetflySpace.gutter, NetflySpace.tabBar + 32),
              sliver: SliverGrid.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  childAspectRatio: 16 / 9,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                ),
                itemCount: items.length,
                itemBuilder: (context, i) => LayoutBuilder(
                  builder: (context, box) => TitleCardView(title: items[i], width: box.maxWidth, row: 'cat'),
                ),
              ),
            ),
            AsyncError(:final error) => SliverToBoxAdapter(
              child: StateMessage.error(
                error,
                title: "We couldn't load this category",
                onRetry: () => ref.invalidate(genrePageProvider((slug: widget.slug, sort: _sort))),
              ),
            ),
            _ => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: NetflyLoader()),
              ),
            ),
          },
        ],
      ),
    );
  }
}
