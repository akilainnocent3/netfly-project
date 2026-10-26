import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../api/generated/models/row.dart' as api;
import '../api/generated/models/title_card.dart';
import '../core/public_config.dart';
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

  /// A release faster than this (px/s) is a deliberate flick: it always moves at least one card,
  /// so a short swipe never springs back to where it started.
  static const flick = 250.0;

  @override
  SnapToItemPhysics applyTo(ScrollPhysics? ancestor) =>
      SnapToItemPhysics(itemExtent: itemExtent, parent: buildParent(ancestor));

  @override
  Simulation? createBallisticSimulation(ScrollMetrics position, double velocity) {
    if (position.outOfRange) return super.createBallisticSimulation(position, velocity);
    final tolerance = toleranceFor(position);
    // Where a free fling would come to rest under the platform's friction, then the nearest card.
    final rest = FrictionSimulation(0.135, position.pixels, velocity).finalX;
    final current = position.pixels / itemExtent;
    var index = (rest / itemExtent).round();
    if (velocity > flick) index = math.max(index, current.floor() + 1);
    if (velocity < -flick) index = math.min(index, current.ceil() - 1);
    final target = (index * itemExtent).clamp(position.minScrollExtent, position.maxScrollExtent);
    if ((target - position.pixels).abs() < tolerance.distance && velocity.abs() < tolerance.velocity) return null;
    return ScrollSpringSimulation(spring, position.pixels, target, velocity, tolerance: tolerance);
  }

  @override
  bool get allowImplicitScrolling => false;
}

class RowHeader extends StatelessWidget {
  const RowHeader(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 18, NetflySpace.gutter, 8),
    child: Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(text, style: NetflyType.h2.copyWith(color: NetflyTheme.of(context).text)),
          ),
        ),
        ?trailing,
      ],
    ),
  );
}

/// One home row: a heading and a horizontally scrolling list of cards. A row that runs past the
/// screen says so: a scroll gauge beside the heading, a chevron on each edge that still has cards
/// behind it, and — on the first few launches — the first such row peeks a little and springs back.
class TitleRow extends ConsumerStatefulWidget {
  const TitleRow({super.key, required this.row});

  final api.Row row;

  /// Rows whose cards already played their entrance this session (they don't replay on scroll-back).
  static final _entered = <String>{};

  /// The peek runs once per session, and only on the first [_peekLaunches] launches.
  static bool _peeked = false;
  static const _peekKey = 'netfly.row_peek.v1';
  static const _peekLaunches = 3;

  /// Warm the first cards' artwork so a row is ready before it scrolls in.
  static void precacheRow(BuildContext context, api.Row row) {
    final width = cardWidth(context);
    for (final item in row.items.take(4)) {
      NetflyImage.precache(context, row.kind == 'top10' ? item.poster : (item.backdrop ?? item.poster), width);
    }
  }

  @override
  ConsumerState<TitleRow> createState() => _TitleRowState();
}

class _TitleRowState extends ConsumerState<TitleRow> with TickerProviderStateMixin {
  final _scroll = ScrollController();
  final _metrics = ValueNotifier<ScrollMetrics?>(null);
  late final _entrance = AnimationController(vsync: this, duration: const Duration(milliseconds: 750));
  late final _nudge = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400));
  ScrollPosition? _feed; // the vertical feed, watched until this row scrolls into view
  double _extent = 1;

  @override
  void initState() {
    super.initState();
    if (TitleRow._entered.contains(widget.row.key)) {
      _entrance.value = 1;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_scroll.hasClients) _metrics.value = _scroll.position.copyWith();
      if (!_entrance.isCompleted) _watchForEntrance();
    });
  }

  @override
  void dispose() {
    _feed?.removeListener(_onFeedScroll);
    _scroll.dispose();
    _metrics.dispose();
    _entrance.dispose();
    _nudge.dispose();
    super.dispose();
  }

  void _watchForEntrance() {
    if (MediaQuery.disableAnimationsOf(context)) {
      TitleRow._entered.add(widget.row.key);
      _entrance.value = 1;
      return;
    }
    _feed = Scrollable.maybeOf(context)?.position;
    if (_feed == null || _inView()) {
      unawaited(_enter());
    } else {
      _feed!.addListener(_onFeedScroll);
    }
  }

  bool _inView() {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return false;
    return box.localToGlobal(Offset.zero).dy < MediaQuery.sizeOf(context).height - 48;
  }

  void _onFeedScroll() {
    if (mounted && _inView()) unawaited(_enter());
  }

  Future<void> _enter() async {
    _feed?.removeListener(_onFeedScroll);
    _feed = null;
    TitleRow._entered.add(widget.row.key);
    await _entrance.forward();
    if (!mounted || (_metrics.value?.extentAfter ?? 0) <= 0) return;
    unawaited(_nudge.forward());
    await _peek();
  }

  /// Slides the row a third of a card and lets the snap spring it back — "there's more this way".
  Future<void> _peek() async {
    final prefs = ref.read(sharedPreferencesProvider);
    final launches = prefs.getInt(TitleRow._peekKey) ?? 0;
    if (TitleRow._peeked || launches >= TitleRow._peekLaunches) return;
    TitleRow._peeked = true;
    unawaited(prefs.setInt(TitleRow._peekKey, launches + 1));
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!mounted || !_scroll.hasClients || _scroll.offset != 0) return;
    await _scroll.animateTo(
      math.min(_extent * 0.3, _scroll.position.maxScrollExtent),
      duration: const Duration(milliseconds: 520),
      curve: Curves.easeInOutCubic,
    );
  }

  /// The edge chevrons: a screenful of whole cards forward or back.
  void _page(int direction) {
    if (!_scroll.hasClients) return;
    unawaited(HapticFeedback.selectionClick());
    final p = _scroll.position;
    final cards = math.max(1, (p.viewportDimension - NetflySpace.gutter) ~/ _extent);
    final index = ((p.pixels + direction * cards * _extent) / _extent).round();
    _scroll.animateTo(
      (index * _extent).clamp(p.minScrollExtent, p.maxScrollExtent),
      duration: NetflyMotion.slow * 1.2,
      curve: NetflyMotion.easeOutExpo,
    );
  }

  /// The first cards slide in from the right, one after another.
  Widget _entering(int i, Widget child) {
    if (i > 3 || _entrance.isCompleted) return child;
    final interval = Interval(i * 0.12, i * 0.12 + 0.6, curve: NetflyMotion.easeOutExpo);
    return AnimatedBuilder(
      animation: _entrance,
      child: child,
      builder: (context, child) {
        final v = interval.transform(_entrance.value);
        return Opacity(
          opacity: v,
          child: Transform.translate(offset: Offset(40 * (1 - v), 0), child: child),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final row = widget.row;
    final top10 = row.kind == 'top10';
    final continueWatching = row.kind == 'continue_watching';
    final width = cardWidth(context);
    final artHeight = top10 ? width * 0.95 : width * 9 / 16;
    final height = artHeight + (continueWatching ? 36 : 0);
    final gap = top10 ? 4.0 : NetflySpace.rowGap;
    _extent = top10 ? width * 0.95 * 2 / 3 * 1.6 + gap : width + gap;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RowHeader(row.title, trailing: _ScrollGauge(_metrics)),
        SizedBox(
          height: height,
          child: Stack(
            children: [
              NotificationListener<Notification>(
                onNotification: (n) {
                  if (n is ScrollNotification && n.depth == 0) _metrics.value = n.metrics.copyWith();
                  if (n is ScrollMetricsNotification && n.depth == 0) _metrics.value = n.metrics.copyWith();
                  return false;
                },
                child: ListView.separated(
                  key: PageStorageKey('row-${row.key}'),
                  controller: _scroll,
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
                  physics: SnapToItemPhysics(itemExtent: _extent, parent: const BouncingScrollPhysics()),
                  itemCount: row.items.length,
                  separatorBuilder: (_, _) => SizedBox(width: gap),
                  itemBuilder: (context, i) {
                    final item = row.items[i];
                    if (top10) {
                      return _entering(
                        i,
                        Top10CardView(
                          title: item,
                          rank: item.context?.rank ?? item.top10Rank ?? i + 1,
                          height: height,
                          row: row.key,
                        ),
                      );
                    }
                    return _entering(
                      i,
                      TitleCardView(
                        title: item,
                        width: width,
                        row: row.key,
                        onMenu: continueWatching ? () => showContinueWatchingMenu(context, ref, item) : null,
                      ),
                    );
                  },
                ),
              ),
              Positioned(
                left: 0,
                top: 0,
                height: artHeight,
                child: _EdgeCue(metrics: _metrics, forward: false, row: row.title, onTap: () => _page(-1)),
              ),
              Positioned(
                right: 0,
                top: 0,
                height: artHeight,
                child: _EdgeCue(metrics: _metrics, forward: true, row: row.title, nudge: _nudge, onTap: () => _page(1)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// A tiny scrollbar beside the row heading: how much of the row is on screen and where you are.
/// Hidden when every card already fits.
class _ScrollGauge extends StatelessWidget {
  const _ScrollGauge(this.metrics);

  final ValueListenable<ScrollMetrics?> metrics;

  static const _track = 36.0;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: ValueListenableBuilder<ScrollMetrics?>(
      valueListenable: metrics,
      builder: (context, m, _) {
        final scrolls = m != null && m.hasContentDimensions && m.maxScrollExtent > 0;
        var thumb = _track;
        var left = 0.0;
        if (scrolls) {
          final content = m.maxScrollExtent - m.minScrollExtent + m.viewportDimension;
          thumb = (_track * m.viewportDimension / content).clamp(8.0, _track);
          left = (_track - thumb) * (m.pixels / m.maxScrollExtent).clamp(0.0, 1.0);
        }
        return AnimatedOpacity(
          opacity: scrolls ? 1 : 0,
          duration: NetflyMotion.base,
          child: Container(
            width: _track,
            height: 3,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(2),
            ),
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: EdgeInsets.only(left: left),
              child: Container(
                width: thumb,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
        );
      },
    ),
  );
}

/// An edge of a row with more cards behind it: a soft scrim and a chevron that pages the row.
/// It fades away once that edge is reached. The forward one nudges twice when the row first shows.
class _EdgeCue extends StatelessWidget {
  const _EdgeCue({required this.metrics, required this.forward, required this.row, required this.onTap, this.nudge});

  final ValueListenable<ScrollMetrics?> metrics;
  final bool forward;
  final String row;
  final VoidCallback onTap;
  final Animation<double>? nudge;

  @override
  Widget build(BuildContext context) {
    final bg = NetflyTheme.of(context).bg;
    final edge = forward ? Alignment.centerRight : Alignment.centerLeft;
    Widget chevron = Icon(
      forward ? Icons.chevron_right_rounded : Icons.chevron_left_rounded,
      size: 30,
      color: Colors.white,
      shadows: const [Shadow(color: Color(0xCC000000), blurRadius: 8)],
    );
    if (nudge != null) {
      chevron = AnimatedBuilder(
        animation: nudge!,
        child: chevron,
        builder: (context, child) {
          final v = nudge!.value;
          // Two beats, each smaller than the last.
          final dx = 6 * math.sin(v * 4 * math.pi).abs() * (1 - v);
          return Transform.translate(offset: Offset(dx, 0), child: child);
        },
      );
    }
    return ValueListenableBuilder<ScrollMetrics?>(
      valueListenable: metrics,
      builder: (context, m, child) {
        final show = m != null && m.hasContentDimensions && (forward ? m.extentAfter : m.extentBefore) > 4;
        return IgnorePointer(
          ignoring: !show,
          child: AnimatedOpacity(opacity: show ? 1 : 0, duration: NetflyMotion.base, child: child),
        );
      },
      child: Semantics(
        button: true,
        label: forward ? 'More in $row' : 'Back in $row',
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: Container(
            width: NetflySpace.touch,
            alignment: edge,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: forward ? Alignment.centerLeft : Alignment.centerRight,
                end: edge,
                colors: [bg.withValues(alpha: 0), bg.withValues(alpha: 0.7)],
              ),
            ),
            child: chevron,
          ),
        ),
      ),
    );
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
