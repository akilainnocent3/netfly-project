import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:material_ui/material_ui.dart';
import 'package:path_drawing/path_drawing.dart';

import 'geometry.dart';

/// Parsed once: the band, its centre line (for the loader's light) and the folds.
class MarkPaths {
  MarkPaths._()
    : band = parseSvgPathData(bandPath)..fillType = PathFillType.evenOdd,
      centerLine = parseSvgPathData(centerLinePath),
      foldPaths = [for (final f in folds) parseSvgPathData(f.path)] {
    centerMetric = centerLine.computeMetrics().first;
    bandBounds = band.getBounds();
  }

  static final instance = MarkPaths._();

  final Path band;
  final Path centerLine;
  final List<Path> foldPaths;
  late final ui.PathMetric centerMetric;
  late final Rect bandBounds;
}

/// The animated parts of the loader, all 0…1. A static mark uses [MarkFrame.still].
class MarkFrame {
  const MarkFrame({this.draw = 1, this.lightOpacity = 0, this.lightPhase = 0, this.deepen = const [0, 0]});

  static const still = MarkFrame();

  /// How much of the ribbon has drawn on along its centre line.
  final double draw;
  final double lightOpacity;

  /// Position of the travelling light along the centre line (one loop = 0 → 1).
  final double lightPhase;

  /// Extra shadow per fold (folds are listed top-left first).
  final List<double> deepen;
}

// Stacked dashes (length in % of the centre line, opacity): one soft-edged highlight.
const _light = <(double, double)>[(28, 0.05), (21, 0.06), (15, 0.07), (9, 0.08), (4, 0.09)];

/// Paints the NETFLY ribbon-diamond exactly like `LogoMark` / `LogoLoader` (packages/ui):
/// band in [color], translucent black fold gradients clipped to the band, a faint sheen.
class LogoMarkPainter extends CustomPainter {
  LogoMarkPainter({required this.color, this.frame = MarkFrame.still}) : super(repaint: null);

  final Color color;
  final MarkFrame frame;

  @override
  void paint(Canvas canvas, Size size) {
    final p = MarkPaths.instance;
    final s = math.min(size.width, size.height) / 100;
    canvas
      ..save()
      ..translate((size.width - 100 * s) / 2, (size.height - 100 * s) / 2)
      ..scale(s)
      // geometry.transform: translate(50 50) rotate(45)
      ..translate(50, 50)
      ..rotate(math.pi / 4);

    final drawing = frame.draw < 1;
    if (drawing) {
      // Draw-on: the band masked by a stroke along the centre line (`nf-draw`).
      canvas.saveLayer(const Rect.fromLTWH(-60, -60, 120, 120), Paint());
    }

    canvas.drawPath(p.band, Paint()..color = color);
    canvas
      ..save()
      ..clipPath(p.band);
    if (frame.lightOpacity > 0) _paintLight(canvas, p);
    for (var i = 0; i < folds.length; i++) {
      for (final layer in folds[i].layers) {
        canvas.drawPath(p.foldPaths[i], Paint()..shader = _shader(layer));
      }
    }
    for (var i = 0; i < folds.length && i < frame.deepen.length; i++) {
      final amount = frame.deepen[i];
      if (amount > 0) canvas.drawPath(p.foldPaths[i], Paint()..color = Colors.black.withValues(alpha: 0.22 * amount));
    }
    canvas.restore();

    // Sheen: white .045 → clear → black .05 across the band (objectBoundingBox x1=0 → x2=1).
    final b = p.bandBounds;
    canvas.drawPath(
      p.band,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(b.left, 0),
          Offset(b.right, 0),
          [
            Colors.white.withValues(alpha: 0.045),
            Colors.white.withValues(alpha: 0),
            Colors.black.withValues(alpha: 0.05),
          ],
          [0, 0.5, 1],
        ),
    );

    if (drawing) {
      final length = p.centerMetric.length * frame.draw.clamp(0, 1);
      canvas
        ..drawPath(
          p.centerMetric.extractPath(0, length),
          Paint()
            ..blendMode = BlendMode.dstIn
            ..style = PaintingStyle.stroke
            ..strokeWidth = bandWidth + 8,
        )
        ..restore();
    }
    canvas.restore();
  }

  void _paintLight(Canvas canvas, MarkPaths p) {
    final metric = p.centerMetric;
    final unit = metric.length / 100;
    final longest = _light.first.$1;
    for (final (length, opacity) in _light) {
      // Shorter dashes run ahead by half the difference, so every dash shares one centre.
      final start = (frame.lightPhase * 100 + (longest - length) / 2) % 100;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = bandWidth + 4
        ..color = Colors.white.withValues(alpha: opacity * frame.lightOpacity);
      final end = start + length;
      canvas.drawPath(metric.extractPath(start * unit, math.min(end, 100) * unit), paint);
      if (end > 100) canvas.drawPath(metric.extractPath(0, (end - 100) * unit), paint); // wraps round
    }
  }

  Shader _shader(FoldLayer layer) {
    final colors = [for (final (_, o) in layer.stops) Colors.black.withValues(alpha: o)];
    final stops = [for (final (offset, _) in layer.stops) offset];
    return layer.radial
        ? ui.Gradient.radial(Offset(layer.a, layer.b), layer.c, colors, stops)
        : ui.Gradient.linear(Offset(layer.a, layer.b), Offset(layer.c, layer.d), colors, stops);
  }

  @override
  bool shouldRepaint(LogoMarkPainter old) =>
      old.color != color ||
      old.frame.draw != frame.draw ||
      old.frame.lightPhase != frame.lightPhase ||
      old.frame.lightOpacity != frame.lightOpacity ||
      old.frame.deepen[0] != frame.deepen[0] ||
      old.frame.deepen[1] != frame.deepen[1];
}

/// The static mark (`LogoMark`). Decorative unless [semanticLabel] is given.
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 32, this.color, this.semanticLabel});

  final double size;
  final Color? color;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final mark = CustomPaint(
      size: Size.square(size),
      painter: LogoMarkPainter(color: color ?? Theme.of(context).colorScheme.primary),
    );
    return semanticLabel == null
        ? ExcludeSemantics(child: mark)
        : Semantics(label: semanticLabel, image: true, child: mark);
  }
}

/// The NETFLY wordmark (mark + letters), as `netfly-logo.v2.svg`.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.height = 28, this.color, this.letterColor = Colors.white, this.reveal = 1});

  final double height;
  final Color? color;
  final Color letterColor;

  /// 0…1: the intro's "ribbons drop in" reveal (1 = fully shown).
  final double reveal;

  @override
  Widget build(BuildContext context) {
    final aspect = wordmarkViewBox.width / wordmarkViewBox.height;
    return Semantics(
      label: 'NETFLY',
      image: true,
      child: CustomPaint(
        size: Size(height * aspect, height),
        painter: _WordmarkPainter(color ?? Theme.of(context).colorScheme.primary, letterColor, reveal),
      ),
    );
  }
}

final _letters = [for (final d in wordmarkLetters) parseSvgPathData(d)];

class _WordmarkPainter extends CustomPainter {
  _WordmarkPainter(this.color, this.letterColor, this.reveal);

  final Color color;
  final Color letterColor;
  final double reveal;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.height / wordmarkViewBox.height;
    canvas
      ..save()
      ..scale(s)
      ..translate(-wordmarkViewBox.left, -wordmarkViewBox.top);

    // The mark first; then each letter drops in from above, staggered (the brand intro).
    final markT = Curves.easeOutCubic.transform((reveal / 0.45).clamp(0, 1));
    canvas
      ..save()
      ..translate(wordmarkMarkBox.left, wordmarkMarkBox.top - (1 - markT) * 40)
      ..saveLayer(null, Paint()..color = Colors.white.withValues(alpha: markT));
    LogoMarkPainter(color: color).paint(canvas, wordmarkMarkBox.size);
    canvas
      ..restore()
      ..restore()
      ..save()
      ..translate(wordmarkLettersOffset.dx, wordmarkLettersOffset.dy);
    for (var i = 0; i < _letters.length; i++) {
      final start = 0.25 + i * 0.09;
      final t = Curves.easeOutBack.transform(((reveal - start) / 0.3).clamp(0, 1));
      if (t <= 0) continue;
      canvas
        ..save()
        ..translate(0, -(1 - t) * 60)
        ..drawPath(_letters[i], Paint()..color = letterColor.withValues(alpha: t.clamp(0, 1)))
        ..restore();
    }
    canvas
      ..restore()
      ..restore();
  }

  @override
  bool shouldRepaint(_WordmarkPainter old) =>
      old.reveal != reveal || old.color != color || old.letterColor != letterColor;
}
