import 'package:material_ui/material_ui.dart';

import '../core/theme.dart';

/// The web's `.skeleton`: a shimmer from surface to elevated tinted 7 % towards the accent, so
/// rows and grids hold their layout while loading (nothing jumps).
class Skeleton extends StatefulWidget {
  const Skeleton({super.key, this.width, this.height, this.radius = NetflySpace.radiusCard, this.aspectRatio});

  final double? width;
  final double? height;
  final double radius;
  final double? aspectRatio;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(vsync: this, duration: NetflyMotion.loaderLoop);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduced = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (reduced) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final tint = Color.lerp(t.elevated, t.accent, 0.07)!;
    Widget box = AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        // background-position −200 % → 200 % over a 200 %-wide gradient.
        final x = -1 + 4 * _controller.value;
        return DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              begin: Alignment(x - 1, 0),
              end: Alignment(x + 1, 0),
              colors: [t.surface, tint, t.surface],
            ),
          ),
          child: SizedBox(width: widget.width, height: widget.height),
        );
      },
    );
    if (widget.aspectRatio != null) box = AspectRatio(aspectRatio: widget.aspectRatio!, child: box);
    return ExcludeSemantics(child: box);
  }
}
