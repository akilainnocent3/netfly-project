import 'dart:ui';

part 'geometry.brand.dart';

/// One gradient layer of a fold shadow (black, varying opacity), in the mark's local units.
class FoldLayer {
  const FoldLayer.linear({
    required double x1,
    required double y1,
    required double x2,
    required double y2,
    required this.stops,
  }) : radial = false,
       a = x1,
       b = y1,
       c = x2,
       d = y2;

  const FoldLayer.radial({required double cx, required double cy, required double r, required this.stops})
    : radial = true,
      a = cx,
      b = cy,
      c = r,
      d = 0;

  final bool radial;
  final double a, b, c, d;

  /// (offset, opacity) pairs.
  final List<(double, double)> stops;
}

class Fold {
  const Fold(this.path, this.layers);

  final String path;
  final List<FoldLayer> layers;
}
