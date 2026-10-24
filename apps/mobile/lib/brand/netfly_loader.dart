import 'dart:async';

import 'package:flutter/scheduler.dart';
import 'package:material_ui/material_ui.dart';

import 'logo_mark.dart';

enum LoaderSize {
  /// 20 px, inline in buttons and text.
  sm(20),

  /// 48 px, sections.
  md(48),

  /// 96 px, full screen and the player.
  lg(96);

  const LoaderSize(this.px);
  final double px;
}

const _loop = 1600.0;
const _drawCurve = Cubic(0.65, 0, 0.35, 1);

/// Piecewise keyframes with ease-in-out between them (CSS `animation-timing-function` applies
/// per keyframe segment).
double _keyframes(double t, List<(double, double)> frames) {
  for (var i = 0; i < frames.length - 1; i++) {
    final (a, va) = frames[i];
    final (b, vb) = frames[i + 1];
    if (t >= a && t <= b) {
      final local = b == a ? 1.0 : (t - a) / (b - a);
      return va + (vb - va) * Curves.easeInOut.transform(local);
    }
  }
  return frames.last.$2;
}

/// The brand loader — the only loading UI in the app (DECISIONS 51 / "Loader policy on mobile").
/// Same timeline as the web's `LogoLoader`: invisible for [delay] so fast loads show nothing,
/// fades in while the ribbon draws on (600 ms), then a light travels the ribbon every 1.6 s, the
/// folds deepen as it passes and the mark breathes over a soft red glow. With
/// `MediaQuery.disableAnimations` only an opacity pulse remains.
class NetflyLoader extends StatefulWidget {
  const NetflyLoader({
    super.key,
    this.size = LoaderSize.md,
    this.label = 'Loading…',
    this.showLabel = false,
    this.decorative = false,
    this.delay = const Duration(milliseconds: 200),
    this.color,
  });

  final LoaderSize size;
  final String label;
  final bool showLabel;

  /// Inside a region already announced as busy: no live region.
  final bool decorative;
  final Duration delay;
  final Color? color;

  @override
  State<NetflyLoader> createState() => _NetflyLoaderState();
}

class _NetflyLoaderState extends State<NetflyLoader> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  Duration _elapsed = Duration.zero;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((elapsed) => setState(() => _elapsed = elapsed))..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final color = widget.color ?? Theme.of(context).colorScheme.primary;
    final t = _elapsed.inMicroseconds / 1000.0 - widget.delay.inMilliseconds; // ms since visible
    final size = widget.size.px;

    double opacity;
    var scale = 1.0;
    var glow = 0.16;
    var frame = MarkFrame.still;
    if (t < 0) {
      opacity = 0;
    } else if (reduced) {
      // nf-pulse: 1 ↔ 0.6 over 1 s, alternating.
      final cycle = (t / 1000) % 2;
      final k = Curves.easeInOut.transform(cycle <= 1 ? cycle : 2 - cycle);
      opacity = 1 - 0.4 * k;
    } else {
      opacity = (t / 200).clamp(0.0, 1.0);
      final loopT = t - 400;
      final phase = loopT >= 0 ? (loopT % _loop) / _loop : 0.0;
      if (loopT >= 0) {
        scale = _keyframes(phase, const [(0, 0.97), (0.5, 1), (1, 0.97)]);
        glow = _keyframes(phase, const [(0, 0.1), (0.5, 0.22), (1, 0.1)]);
      }
      frame = MarkFrame(
        draw: _drawCurve.transform((t / 600).clamp(0.0, 1.0)),
        lightOpacity: loopT >= 0 ? Curves.easeOut.transform((loopT / 300).clamp(0.0, 1.0)) : 0,
        lightPhase: phase,
        deepen: loopT >= 0
            ? [
                _keyframes(phase, const [(0, 0), (0.56, 0), (0.70, 1), (0.84, 0), (1, 0)]),
                _keyframes(phase, const [(0, 0), (0.06, 0), (0.20, 1), (0.34, 0), (1, 0)]),
              ]
            : const [0, 0],
      );
    }

    Widget art = SizedBox.square(
      dimension: size,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          if (widget.size != LoaderSize.sm && !reduced)
            Positioned(
              left: -size * 0.45,
              top: -size * 0.45,
              right: -size * 0.45,
              bottom: -size * 0.45,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      color.withValues(alpha: glow),
                      color.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          Transform.scale(
            scale: scale,
            child: CustomPaint(
              size: Size.square(size),
              painter: LogoMarkPainter(color: color, frame: frame),
            ),
          ),
        ],
      ),
    );
    art = Opacity(opacity: opacity.clamp(0, 1), child: art);

    final content = widget.showLabel && widget.size == LoaderSize.lg
        ? Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              art,
              const SizedBox(height: 14),
              Opacity(
                opacity: opacity.clamp(0, 1),
                child: Text(
                  widget.label,
                  style: TextStyle(fontSize: 14, height: 1.3, color: Colors.white.withValues(alpha: 0.7)),
                ),
              ),
            ],
          )
        : art;
    if (widget.decorative) return ExcludeSemantics(child: content);
    return Semantics(
      liveRegion: true,
      label: widget.label,
      child: ExcludeSemantics(child: content),
    );
  }
}

/// Shows [NetflyLoader] while [active], never flashing: nothing for the loader's delay, then at
/// least [minimum] on screen, then a 150 ms fade out (`LoaderPresence` on the web).
class LoaderPresence extends StatefulWidget {
  const LoaderPresence({
    super.key,
    required this.active,
    this.size = LoaderSize.md,
    this.label = 'Loading…',
    this.decorative = false,
    this.minimum = const Duration(milliseconds: 400),
    this.delay = const Duration(milliseconds: 200),
  });

  final bool active;
  final LoaderSize size;
  final String label;
  final bool decorative;
  final Duration minimum;
  final Duration delay;

  @override
  State<LoaderPresence> createState() => _LoaderPresenceState();
}

class _LoaderPresenceState extends State<LoaderPresence> {
  bool _mounted = false;
  bool _exiting = false;
  DateTime? _shownAt;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.active) _start();
  }

  @override
  void didUpdateWidget(LoaderPresence old) {
    super.didUpdateWidget(old);
    if (widget.active && !old.active) _start();
    if (!widget.active && old.active) _stop();
  }

  void _start() {
    _timer?.cancel();
    setState(() {
      _mounted = true;
      _exiting = false;
      _shownAt = DateTime.now().add(widget.delay);
    });
  }

  void _stop() {
    _timer?.cancel();
    final shownAt = _shownAt;
    final now = DateTime.now();
    if (shownAt == null || now.isBefore(shownAt)) {
      setState(() => _mounted = false); // finished before it ever showed
      return;
    }
    final left = widget.minimum - now.difference(shownAt);
    _timer = Timer(left.isNegative ? Duration.zero : left, () {
      if (!mounted) return;
      setState(() => _exiting = true);
      _timer = Timer(const Duration(milliseconds: 150), () {
        if (mounted) setState(() => _mounted = false);
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_mounted) return const SizedBox.shrink();
    return AnimatedOpacity(
      opacity: _exiting ? 0 : 1,
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeIn,
      child: NetflyLoader(size: widget.size, label: widget.label, decorative: widget.decorative, delay: widget.delay),
    );
  }
}

/// A full-screen loading state (app start, a screen with no layout to hold, the player).
class LoaderScreen extends StatelessWidget {
  const LoaderScreen({super.key, this.label = 'Loading…'});

  final String label;

  @override
  Widget build(BuildContext context) => Center(
    child: NetflyLoader(size: LoaderSize.lg, label: label),
  );
}
