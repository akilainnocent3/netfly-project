import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../brand/logo_mark.dart';
import '../brand/netfly_loader.dart';

/// Pull-to-refresh with the brand loader (no Material spinner): the mark grows and draws on
/// as the list is pulled; past the threshold a release refreshes and the loader runs until done.
/// The child must be a scroll view using [BrandRefresh.physics].
class BrandRefresh extends StatefulWidget {
  const BrandRefresh({super.key, required this.onRefresh, required this.child, this.top = 0});

  final Future<void> Function() onRefresh;
  final Widget child;

  /// Where the loader sits (below a transparent header).
  final double top;

  static const physics = AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics());

  @override
  State<BrandRefresh> createState() => _BrandRefreshState();
}

class _BrandRefreshState extends State<BrandRefresh> {
  static const _threshold = 90.0;
  double _pull = 0;
  bool _refreshing = false;
  bool _armed = false;

  bool _onScroll(ScrollNotification n) {
    if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
    final over = -n.metrics.pixels + n.metrics.minScrollExtent;
    if (!_refreshing) {
      final pull = over.clamp(0.0, _threshold * 1.5);
      if (pull != _pull) setState(() => _pull = pull);
      if (!_armed && pull >= _threshold && n is ScrollUpdateNotification && n.dragDetails != null) {
        _armed = true;
        unawaited(HapticFeedback.mediumImpact());
      }
      if (_armed && pull < _threshold && n is ScrollUpdateNotification && n.dragDetails != null) _armed = false;
      if (_armed && (n is ScrollEndNotification || (n is ScrollUpdateNotification && n.dragDetails == null))) {
        _armed = false;
        _run();
      }
    }
    return false;
  }

  Future<void> _run() async {
    setState(() => _refreshing = true);
    try {
      await widget.onRefresh();
    } finally {
      if (mounted) {
        setState(() {
          _refreshing = false;
          _pull = 0;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final progress = (_pull / _threshold).clamp(0.0, 1.0);
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: Stack(
        children: [
          widget.child,
          if (_refreshing || progress > 0)
            Positioned(
              top: widget.top + 12,
              left: 0,
              right: 0,
              child: IgnorePointer(
                child: Center(
                  child: _refreshing
                      ? const NetflyLoader(size: LoaderSize.md, label: 'Refreshing…', delay: Duration.zero)
                      : Opacity(
                          opacity: progress,
                          child: Transform.scale(
                            scale: 0.6 + 0.4 * progress,
                            child: SizedBox.square(
                              dimension: 48,
                              child: CustomPaint(
                                painter: LogoMarkPainter(
                                  color: Theme.of(context).colorScheme.primary,
                                  frame: MarkFrame(draw: progress),
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
    );
  }
}
