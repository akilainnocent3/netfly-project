import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../api/generated/models/row.dart' as api;
import '../api/generated/models/title_card.dart';
import '../core/theme.dart';
import '../data/engagement.dart';
import 'netfly_image.dart';
import 'skeleton.dart';
import 'title_card.dart';

/// Card width: the web row's --cols per breakpoint (1.7 cards on a phone, so a card is big enough
/// to read and the next one peeks in), filling the screen minus the left gutter.
double cardWidth(BuildContext context) {
  final screen = MediaQuery.sizeOf(context).width;
  final cols = screen < 640 ? 1.7 : (screen < 768 ? 3.3 : (screen < 1024 ? 4.3 : 5.3));
  return (screen - NetflySpace.gutter - (cols - 1) * NetflySpace.rowGap) / cols;
}

/// Snaps a horizontal row to card boundaries after a fling, keeping momentum.
class SnapToItemPhysics extends ScrollPhysics {
  const SnapToItemPhysics({required this.itemExtent, super.parent});

  final double itemExtent;

  @override
  SnapToItemPhysics applyTo(ScrollPhysics? ancestor) =>
      SnapToItemPhysics(itemExtent: itemExtent, parent: buildParent(ancestor));

  @override
  Simulation? createBallisticSimulation(ScrollMetrics position, double velocity) {
    final tolerance = toleranceFor(position);
    final projected = position.pixels + velocity * 0.35; // where a free fling would roughly land
    final target = (projected / itemExtent).round() * itemExtent;
    final clamped = target.clamp(position.minScrollExtent, position.maxScrollExtent);
    if ((clamped - position.pixels).abs() < tolerance.distance && velocity.abs() < tolerance.velocity) return null;
    if (position.outOfRange) return super.createBallisticSimulation(position, velocity);
    return ScrollSpringSimulation(spring, position.pixels, clamped, velocity, tolerance: tolerance);
  }

  @override
  bool get allowImplicitScrolling => false;
}

class RowHeader extends StatelessWidget {
  const RowHeader(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 18, NetflySpace.gutter, 8),
    child: Semantics(
      header: true,
      child: Text(text, style: NetflyType.h2.copyWith(color: NetflyTheme.of(context).text)),
    ),
  );
}

/// One home row: a heading and a horizontally scrolling list of cards.
class TitleRow extends ConsumerWidget {
  const TitleRow({super.key, required this.row});

  final api.Row row;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final top10 = row.kind == 'top10';
    final continueWatching = row.kind == 'continue_watching';
    final width = cardWidth(context);
    final height = top10 ? width * 0.95 : width * 9 / 16 + (continueWatching ? 36 : 0);
    final gap = top10 ? 4.0 : NetflySpace.rowGap;
    final extent = top10 ? width * 0.95 * 2 / 3 * 1.6 + gap : width + gap;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RowHeader(row.title),
        SizedBox(
          height: height,
          child: ListView.separated(
            key: PageStorageKey('row-${row.key}'),
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
            physics: SnapToItemPhysics(itemExtent: extent, parent: const BouncingScrollPhysics()),
            itemCount: row.items.length,
            separatorBuilder: (_, _) => SizedBox(width: gap),
            itemBuilder: (context, i) {
              final item = row.items[i];
              if (top10) {
                return Top10CardView(
                  title: item,
                  rank: item.context?.rank ?? item.top10Rank ?? i + 1,
                  height: height,
                  row: row.key,
                );
              }
              return TitleCardView(
                title: item,
                width: width,
                row: row.key,
                onMenu: continueWatching ? () => showContinueWatchingMenu(context, ref, item) : null,
              );
            },
          ),
        ),
      ],
    );
  }

  /// Warm the first cards' artwork so a row is ready before it scrolls in.
  static void precacheRow(BuildContext context, api.Row row) {
    final width = cardWidth(context);
    for (final item in row.items.take(4)) {
      NetflyImage.precache(context, row.kind == 'top10' ? item.poster : (item.backdrop ?? item.poster), width);
    }
  }
}

/// Continue Watching's ⋯: hide, rate, info.
Future<void> showContinueWatchingMenu(BuildContext context, WidgetRef ref, TitleCard title) {
  final t = NetflyTheme.of(context);
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    showDragHandle: true,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(title.title, style: NetflyType.h3.copyWith(color: t.text)),
          ),
          ListTile(
            leading: const Icon(Icons.info_outline_rounded),
            title: const Text('Episodes & info'),
            onTap: () {
              Navigator.pop(sheet);
              openTitle(context, title, row: 'continue');
            },
          ),
          ListTile(
            leading: const Icon(Icons.thumb_up_alt_outlined),
            title: const Text('Rate this'),
            onTap: () {
              Navigator.pop(sheet);
              engage(
                context,
                () => ref.read(engagementProvider.notifier).rate(title.id, 1),
                done: 'Thanks — we’ll show more like this.',
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.close_rounded),
            title: const Text('Remove from Continue Watching'),
            onTap: () {
              Navigator.pop(sheet);
              engage(
                context,
                () => ref.read(engagementProvider.notifier).hideFromContinueWatching(title.id),
                done: 'Removed. Play it again any time to bring it back.',
              );
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

/// Skeleton rows while the feed loads (they hold the layout, so nothing jumps).
class RowsSkeleton extends StatelessWidget {
  const RowsSkeleton({super.key, this.rows = 3});
  final int rows;

  @override
  Widget build(BuildContext context) {
    final width = cardWidth(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var r = 0; r < rows; r++) ...[
          const Padding(
            padding: EdgeInsets.fromLTRB(NetflySpace.gutter, 18, NetflySpace.gutter, 8),
            child: Skeleton(width: 140, height: 18, radius: 4),
          ),
          SizedBox(
            height: width * 9 / 16,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
              itemCount: 3,
              separatorBuilder: (_, _) => const SizedBox(width: NetflySpace.rowGap),
              itemBuilder: (_, _) => Skeleton(width: width, aspectRatio: 16 / 9),
            ),
          ),
        ],
      ],
    );
  }
}
