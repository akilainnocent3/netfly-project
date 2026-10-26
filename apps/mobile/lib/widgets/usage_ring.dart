import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../api/generated/models/usage_scope_enum.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../data/usage.dart';
import '../features/billing/plans_screen.dart';
import 'buttons.dart';

String _within(UsageScopeEnum scope) => switch (scope) {
  UsageScopeEnum.week => 'this week',
  UsageScopeEnum.month => 'this month',
  _ => 'today',
};

String _windowLabel(UsageScopeEnum scope) => switch (scope) {
  UsageScopeEnum.week => 'This week',
  UsageScopeEnum.month => 'This month',
  _ => 'Today',
};

/// One line on where the viewer stands: "42 min left today" / "Limit reached · back tomorrow at 12:00 AM".
String usageSummary(UsageView view) => view.reached
    ? 'Limit reached · back ${resetPhrase(view.resetsAt)}'
    : '${spanPhrase(Duration(seconds: view.remaining))} left ${_within(view.scope)}';

/// The viewing-time ring beside the bell. While watching, a red arc fills clockwise from twelve
/// o'clock with the time used; when it closes the limit is reached and the ring turns green,
/// filling again as the reset approaches (the hourglass inside turns over now and then) — when
/// the green closes, viewing time is back. Hidden for viewers without limits.
class UsageRing extends ConsumerStatefulWidget {
  const UsageRing({super.key, this.size = 26, this.interactive = true});

  final double size;

  /// Off inside a list tile, where the tile itself opens the details.
  final bool interactive;

  @override
  ConsumerState<UsageRing> createState() => _UsageRingState();
}

class _UsageRingState extends ConsumerState<UsageRing> with SingleTickerProviderStateMixin {
  late final _flip = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  Timer? _clock;
  int _turns = 0;
  bool _justReset = false;
  Timer? _celebration;

  @override
  void dispose() {
    _flip.dispose();
    _clock?.cancel();
    _celebration?.cancel();
    super.dispose();
  }

  /// While waiting for the reset: every eight seconds the hourglass turns over and the green
  /// arc creeps on — slow enough to sit unnoticed until looked at, and idle in between.
  void _waiting(bool on) {
    if (on == (_clock != null)) return;
    _clock?.cancel();
    _clock = null;
    if (!on) return;
    _clock = Timer.periodic(const Duration(seconds: 8), (_) {
      if (!mounted) return;
      if (!MediaQuery.disableAnimationsOf(context)) {
        _flip.forward(from: 0).whenComplete(() {
          _turns++;
          _flip.value = 0;
        });
      }
      setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(usageProvider, (before, next) {
      final was = before?.value?.view?.reached ?? false;
      final now = next.value?.view?.reached ?? false;
      if (was && !now) {
        setState(() => _justReset = true);
        _celebration?.cancel();
        _celebration = Timer(const Duration(milliseconds: 2400), () {
          if (mounted) setState(() => _justReset = false);
        });
      }
    });
    final t = NetflyTheme.of(context);
    final state = ref.watch(usageProvider).value;
    final view = state?.view;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _waiting(view?.reached ?? false);
    });
    if (state == null || view == null) return const SizedBox.shrink();

    final reached = view.reached;
    final green = reached || _justReset;
    final fraction = _justReset
        ? 1.0
        : reached
        ? resetProgress(state.reachedAt ?? DateTime.now(), view.resetsAt, DateTime.now())
        : view.fraction;
    final color = green ? t.match : t.accent;
    final iconSize = widget.size * 0.56;

    final icon = _justReset
        ? Icon(Icons.check_rounded, key: const ValueKey('reset'), size: iconSize, color: t.match)
        : reached
        ? AnimatedBuilder(
            key: const ValueKey('waiting'),
            animation: _flip,
            builder: (context, child) => Transform.rotate(
              angle: (_turns + Curves.easeInOutCubic.transform(_flip.value)) * math.pi,
              child: child,
            ),
            child: Icon(Icons.hourglass_bottom_rounded, size: iconSize, color: t.text),
          )
        : Icon(Icons.hourglass_top_rounded, key: const ValueKey('watching'), size: iconSize, color: t.text);

    final ring = SizedBox.square(
      dimension: widget.size,
      child: TweenAnimationBuilder<double>(
        tween: Tween(end: fraction),
        duration: const Duration(milliseconds: 1100),
        curve: NetflyMotion.easeOutExpo,
        builder: (context, value, child) => TweenAnimationBuilder<Color?>(
          tween: ColorTween(end: color),
          duration: NetflyMotion.slow,
          builder: (context, c, child) => CustomPaint(
            painter: _RingPainter(fraction: value, color: c ?? color, track: t.text.withValues(alpha: 0.18)),
            child: child,
          ),
          child: child,
        ),
        child: Center(
          child: AnimatedSwitcher(
            duration: NetflyMotion.slow,
            switchInCurve: NetflyMotion.easeOutExpo,
            transitionBuilder: (child, a) => ScaleTransition(
              scale: Tween(begin: 0.6, end: 1.0).animate(a),
              child: FadeTransition(opacity: a, child: child),
            ),
            child: icon,
          ),
        ),
      ),
    );

    final label = 'Viewing time: ${usageSummary(view)}';
    if (!widget.interactive) return Semantics(label: label, excludeSemantics: true, child: ring);
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: InkResponse(
        radius: 22,
        onTap: () => showUsageSheet(context),
        child: SizedBox(width: 40, height: 44, child: Center(child: ring)),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.fraction, required this.color, required this.track});

  final double fraction;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.1;
    final rect = (Offset.zero & size).deflate(stroke / 2);
    canvas.drawOval(
      rect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..color = track,
    );
    if (fraction <= 0) return;
    canvas.drawArc(
      rect,
      -math.pi / 2,
      2 * math.pi * fraction,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = fraction >= 1 ? StrokeCap.butt : StrokeCap.round
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.fraction != fraction || old.color != color || old.track != track;
}

/// Viewing time in detail: each window's use and when it resets, live while open.
Future<void> showUsageSheet(BuildContext context) {
  final t = NetflyTheme.of(context);
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: t.elevated,
    showDragHandle: true,
    // Sized to its content but scrolls once that outgrows the screen, so the button stays reachable.
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => const SafeArea(child: SingleChildScrollView(child: _UsageSheet())),
  );
}

class _UsageSheet extends ConsumerWidget {
  const _UsageSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = NetflyTheme.of(context);
    final state = ref.watch(usageProvider).value;
    final view = state?.view;
    final windows = state == null ? const <UsageView>[] : usageWindows(state.snapshot);
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const UsageRing(size: 32, interactive: false),
              if (view != null) const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Viewing time', style: NetflyType.h2.copyWith(color: t.text)),
                    if (state != null)
                      Text(
                        view == null ? 'Unlimited on ${state.snapshot.plan.name}' : usageSummary(view),
                        style: NetflyType.meta.copyWith(color: view?.reached == true ? t.match : t.muted),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          for (final w in windows) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    _windowLabel(w.scope),
                    style: NetflyType.body.copyWith(color: t.text, fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  '${spanPhrase(Duration(seconds: w.used))} of ${spanPhrase(Duration(seconds: w.limit))}',
                  style: NetflyType.meta.copyWith(color: t.muted),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: TweenAnimationBuilder<double>(
                tween: Tween(end: w.fraction),
                duration: const Duration(milliseconds: 900),
                curve: NetflyMotion.easeOutExpo,
                builder: (context, value, _) => LinearProgressIndicator(
                  value: value,
                  minHeight: 6,
                  color: t.accent,
                  backgroundColor: t.text.withValues(alpha: 0.12),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              w.reached ? 'Limit reached · resets ${resetPhrase(w.resetsAt)}' : 'Resets ${resetPhrase(w.resetsAt)}',
              style: NetflyType.caption.copyWith(color: w.reached ? t.match : t.subtle),
            ),
            const SizedBox(height: 16),
          ],
          if (state?.snapshot.plan.isFree == true) ...[
            const SizedBox(height: 4),
            NetflyButton(
              label: 'Get more viewing time',
              expand: true,
              onPressed: () async {
                final router = GoRouter.of(context);
                final navigator = Navigator.of(context);
                // Fetch the plans while the button holds its loader, so the screen opens ready.
                final keep = ProviderScope.containerOf(context).listen(plansProvider.future, (_, _) {});
                try {
                  await keep.read();
                } catch (_) {
                  // The plans screen shows the error and a retry.
                }
                navigator.pop();
                unawaited(router.push('/plans'));
                WidgetsBinding.instance.addPostFrameCallback((_) => keep.close());
              },
            ),
          ],
        ],
      ),
    );
  }
}
