import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/title_card.dart';
import '../../api/generated/models/upcoming.dart';
import '../../brand/netfly_loader.dart';
import '../../core/theme.dart';
import '../../data/catalog.dart';
import '../../data/engagement.dart';
import '../../widgets/badge.dart';
import '../../widgets/brand_refresh.dart';
import '../../widgets/buttons.dart';
import '../../widgets/netfly_image.dart';
import '../../widgets/state_message.dart';
import '../../widgets/title_card.dart';
import '../notifications/notifications_screen.dart';
import '../shell/shell.dart';

/// New & Hot: Coming soon (with Remind me), Everyone's watching, Top 10 series, Top 10 films.
class NewHotScreen extends ConsumerStatefulWidget {
  const NewHotScreen({super.key});

  @override
  ConsumerState<NewHotScreen> createState() => _NewHotScreenState();
}

class _NewHotScreenState extends ConsumerState<NewHotScreen> {
  final _scroll = ScrollController();
  int _tab = 0;
  static const _tabs = [
    ('🍿', 'Coming Soon'),
    ('🔥', "Everyone's Watching"),
    ('🔟', 'Top 10 Series'),
    ('🔟', 'Top 10 Films'),
  ];

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    listenForTabReselect(ref, 1, _scroll);
    final t = NetflyTheme.of(context);
    final data = ref.watch(newAndPopularProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text('New & Hot', style: NetflyType.h2.copyWith(fontSize: 22, fontWeight: FontWeight.w800)),
        centerTitle: false,
        actions: const [NotificationsBell(), SizedBox(width: 8)],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter, vertical: 8),
              children: [
                for (var i = 0; i < _tabs.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Semantics(
                      selected: _tab == i,
                      button: true,
                      label: _tabs[i].$2,
                      excludeSemantics: true,
                      child: Material(
                        color: _tab == i ? Colors.white : Colors.transparent,
                        shape: const StadiumBorder(),
                        child: InkWell(
                          customBorder: const StadiumBorder(),
                          onTap: () => setState(() => _tab = i),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            child: Center(
                              child: Text(
                                '${_tabs[i].$1} ${_tabs[i].$2}',
                                style: NetflyType.meta.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: _tab == i ? Colors.black : t.text,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      body: BrandRefresh(
        onRefresh: () async {
          ref.invalidate(newAndPopularProvider);
          await ref.read(newAndPopularProvider.future);
        },
        child: switch (data) {
          AsyncData(:final value) => CustomScrollView(
            controller: _scroll,
            physics: BrandRefresh.physics,
            slivers: [
              if (_tab == 0)
                value.comingSoon.isEmpty
                    ? const SliverToBoxAdapter(
                        child: StateMessage(
                          title: 'Nothing announced yet',
                          body: 'Check back soon for what’s coming.',
                          icon: Icons.event_outlined,
                        ),
                      )
                    : SliverList.builder(
                        itemCount: value.comingSoon.length,
                        itemBuilder: (_, i) => _ComingSoon(item: value.comingSoon[i]),
                      )
              else
                _TitleList(
                  items: switch (_tab) {
                    1 => value.everyoneWatching,
                    2 => value.top10Series,
                    _ => value.top10Films,
                  },
                  ranked: _tab >= 2,
                ),
              const SliverToBoxAdapter(child: SizedBox(height: NetflySpace.tabBar + 32)),
            ],
          ),
          AsyncError(:final error) => StateMessage.error(error, onRetry: () => ref.invalidate(newAndPopularProvider)),
          _ => const Center(child: NetflyLoader()),
        },
      ),
    );
  }
}

class _ComingSoon extends ConsumerWidget {
  const _ComingSoon({required this.item});
  final Upcoming item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final engagement = ref.watch(engagementProvider.notifier);
    ref.watch(engagementProvider);
    final reminded = engagement.reminded(item.id, item.reminded ?? false);
    final at = item.publishAt?.toLocal();
    return Padding(
      padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 12, NetflySpace.gutter, 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (at != null)
            SizedBox(
              width: 48,
              child: Column(
                children: [
                  Text(DateFormat.MMM().format(at).toUpperCase(), style: NetflyType.meta.copyWith(color: t.muted)),
                  Text('${at.day}', style: NetflyType.h1.copyWith(color: t.text)),
                ],
              ),
            ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: AspectRatio(
                    aspectRatio: 16 / 9,
                    child: NetflyImage(image: item.backdrop ?? item.poster, semanticLabel: item.title),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: Text(item.title, style: NetflyType.h3.copyWith(color: t.text)),
                    ),
                    CircleIconButton(
                      icon: reminded ? Icons.notifications_active_rounded : Icons.notifications_none_rounded,
                      label: reminded ? 'Reminder set for ${item.title}' : 'Remind me about ${item.title}',
                      filled: reminded,
                      onPressed: () {
                        if (!requireAccount(context, ref)) return;
                        engage(
                          context,
                          () => engagement.setReminder(item.id, !reminded),
                          done: reminded ? 'Reminder removed' : 'We’ll let you know when it’s out.',
                        );
                      },
                    ),
                  ],
                ),
                if (at != null)
                  Text('Coming ${DateFormat.MMMMEEEEd().format(at)}', style: NetflyType.meta.copyWith(color: t.muted)),
                const SizedBox(height: 6),
                Text(
                  item.synopsis,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: NetflyType.body.copyWith(color: t.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TitleList extends StatelessWidget {
  const _TitleList({required this.items, required this.ranked});
  final List<TitleCard> items;
  final bool ranked;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    if (items.isEmpty) {
      return const SliverToBoxAdapter(
        child: StateMessage(title: 'Nothing here yet', icon: Icons.movie_filter_outlined),
      );
    }
    return SliverList.builder(
      itemCount: items.length,
      itemBuilder: (context, i) {
        final item = items[i];
        return Padding(
          padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 12, NetflySpace.gutter, 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (ranked)
                SizedBox(
                  width: 40,
                  child: Text('${i + 1}', style: NetflyType.h1.copyWith(fontSize: 34, color: t.text)),
                ),
              Expanded(
                child: GestureDetector(
                  onTap: () => openTitle(context, item, row: 'new-hot'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: AspectRatio(
                          aspectRatio: 16 / 9,
                          child: Hero(
                            tag: heroTag(item, 'new-hot'),
                            child: CardArt(title: item),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          if (ranked) const Padding(padding: EdgeInsets.only(right: 6), child: Top10Mark(height: 20)),
                          Expanded(
                            child: Text(item.title, style: NetflyType.h3.copyWith(fontSize: 18, color: t.text)),
                          ),
                          NetflyButton(
                            label: 'Play',
                            icon: Icons.play_arrow_rounded,
                            variant: NetflyButtonVariant.play,
                            size: NetflyButtonSize.sm,
                            onPressed: () => context.push('/watch/${item.slug}'),
                          ),
                        ],
                      ),
                      if (item.shortSynopsis != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            item.shortSynopsis!,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: NetflyType.meta.copyWith(color: t.muted),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
