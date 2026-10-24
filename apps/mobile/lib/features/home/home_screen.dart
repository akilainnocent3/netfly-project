import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/home_page.dart';
import '../../brand/netfly_loader.dart';
import '../../core/theme.dart';
import '../../data/catalog.dart';
import '../../widgets/brand_refresh.dart';
import '../../widgets/state_message.dart';
import '../../widgets/title_row.dart';
import '../shell/shell.dart';
import 'header.dart';
import 'hero.dart';

/// Home, Series and Films: the billboard, then the infinite feed of rows (Continue Watching and
/// "Because you watched…" first, as the server orders them).
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key, this.kind});

  final String? kind;

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _scroll = ScrollController();
  double _offset = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final offset = _scroll.offset;
      if ((offset - _offset).abs() > 2 || offset <= 0) setState(() => _offset = offset);
      if (_scroll.position.extentAfter < 900) ref.read(homeFeedProvider(widget.kind).notifier).loadMore();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(billboardProvider((kind: widget.kind)));
    ref.invalidate(homeFeedProvider(widget.kind));
    await ref.read(homeFeedProvider(widget.kind).future);
  }

  @override
  Widget build(BuildContext context) {
    listenForTabReselect(ref, 0, _scroll);
    final billboard = ref.watch(billboardProvider((kind: widget.kind)));
    final feed = ref.watch(homeFeedProvider(widget.kind));
    final notifier = ref.read(homeFeedProvider(widget.kind).notifier);
    final rows = [for (final page in feed.value ?? const <HomePage>[]) ...page.rows];
    final header = HomeHeader(solid: (_offset / 120).clamp(0.0, 1.0), kind: widget.kind);
    final heroHeight = MediaQuery.sizeOf(context).width * 1.5 * 0.92 + MediaQuery.paddingOf(context).top + 120;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: header,
      body: BrandRefresh(
        top: header.preferredSize.height + MediaQuery.paddingOf(context).top,
        onRefresh: _refresh,
        child: CustomScrollView(
          controller: _scroll,
          physics: BrandRefresh.physics,
          slivers: [
            SliverToBoxAdapter(
              child: SizedBox(
                height: heroHeight,
                child: switch (billboard) {
                  AsyncData(:final value) when value.isNotEmpty => PosterHero(item: value.first, scroll: _offset),
                  AsyncData() => SizedBox(height: MediaQuery.paddingOf(context).top + 104),
                  AsyncError() => const SizedBox.shrink(), // the hero fails alone (decision 32)
                  _ => const HeroSkeleton(),
                },
              ),
            ),
            if (feed.isLoading && rows.isEmpty)
              const SliverToBoxAdapter(
                child: Stack(
                  alignment: Alignment.topCenter,
                  children: [
                    RowsSkeleton(),
                    Padding(padding: EdgeInsets.only(top: 60), child: LoaderPresence(active: true)),
                  ],
                ),
              )
            else if (feed.hasError && rows.isEmpty)
              SliverToBoxAdapter(child: StateMessage.error(feed.error!, onRetry: _refresh))
            else if (rows.isEmpty)
              const SliverToBoxAdapter(
                child: StateMessage(
                  title: 'Nothing here yet',
                  body: 'New titles are on the way. Try switching the translation filter at the top.',
                  icon: Icons.movie_filter_outlined,
                ),
              )
            else
              SliverList.builder(
                itemCount: rows.length + 1,
                itemBuilder: (context, i) {
                  if (i == rows.length) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Center(
                        child: notifier.hasMore ? const NetflyLoader(size: LoaderSize.sm) : const SizedBox.shrink(),
                      ),
                    );
                  }
                  if (i + 1 < rows.length) {
                    final next = rows[i + 1];
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (context.mounted) TitleRow.precacheRow(context, next);
                    });
                  }
                  return TitleRow(row: rows[i]);
                },
              ),
            const SliverToBoxAdapter(child: SizedBox(height: NetflySpace.tabBar + 32)),
          ],
        ),
      ),
    );
  }
}
