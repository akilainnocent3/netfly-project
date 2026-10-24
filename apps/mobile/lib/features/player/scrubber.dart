import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/theme.dart';
import 'thumbnails.dart';

String formatTime(double seconds) {
  final s = seconds.isFinite ? seconds.round().clamp(0, 359999) : 0;
  final h = s ~/ 3600, m = (s % 3600) ~/ 60, sec = s % 60;
  final mm = h > 0 ? m.toString().padLeft(2, '0') : '$m';
  return '${h > 0 ? '$h:' : ''}$mm:${sec.toString().padLeft(2, '0')}';
}

/// The web scrubber: buffered range, intro/credits markers, and a sprite-sheet preview above the
/// thumb while dragging (from the same `thumbs.vtt`).
class Scrubber extends StatefulWidget {
  const Scrubber({
    super.key,
    required this.position,
    required this.duration,
    required this.buffered,
    required this.thumbs,
    required this.markers,
    required this.onSeek,
    required this.onStart,
  });

  final double position;
  final double duration;
  final double buffered;
  final List<ThumbCue> thumbs;
  final List<(double, double)> markers;
  final ValueChanged<double> onSeek;
  final VoidCallback onStart;

  @override
  State<Scrubber> createState() => _ScrubberState();
}

class _ScrubberState extends State<Scrubber> {
  double? _drag;

  ThumbCue? _cueAt(double t) {
    for (final cue in widget.thumbs) {
      if (t >= cue.start && t < cue.end) return cue;
    }
    return widget.thumbs.isEmpty ? null : widget.thumbs.last;
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final d = widget.duration > 0 ? widget.duration : 1.0;
    final shown = _drag ?? widget.position;
    return LayoutBuilder(
      builder: (context, box) {
        double toTime(double dx) => (dx / box.maxWidth).clamp(0.0, 1.0) * d;
        final x = (shown / d).clamp(0.0, 1.0) * box.maxWidth;
        final cue = _drag == null ? null : _cueAt(_drag!);
        return Semantics(
          slider: true,
          label: 'Seek',
          value: '${formatTime(shown)} of ${formatTime(d)}',
          increasedValue: formatTime(shown + 10),
          decreasedValue: formatTime(shown - 10),
          onIncrease: () => widget.onSeek(shown + 10),
          onDecrease: () => widget.onSeek(shown - 10),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: (e) {
              widget.onStart();
              unawaited(HapticFeedback.selectionClick());
              setState(() => _drag = toTime(e.localPosition.dx));
            },
            onHorizontalDragUpdate: (e) => setState(() => _drag = toTime(e.localPosition.dx)),
            onHorizontalDragEnd: (_) {
              widget.onSeek(_drag ?? widget.position);
              setState(() => _drag = null);
            },
            onTapUp: (e) => widget.onSeek(toTime(e.localPosition.dx)),
            child: SizedBox(
              height: 44,
              child: Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.centerLeft,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          height: 4,
                          decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2)),
                          child: Stack(
                            children: [
                              FractionallySizedBox(
                                widthFactor: (widget.buffered / d).clamp(0.0, 1.0),
                                child: Container(color: Colors.white38),
                              ),
                              for (final (start, end) in widget.markers)
                                Positioned(
                                  left: (start / d).clamp(0.0, 1.0) * box.maxWidth,
                                  width: ((end - start) / d).clamp(0.0, 1.0) * box.maxWidth,
                                  top: 0,
                                  bottom: 0,
                                  child: Container(color: Colors.white.withValues(alpha: 0.35)),
                                ),
                              FractionallySizedBox(
                                widthFactor: (shown / d).clamp(0.0, 1.0),
                                child: Container(color: t.accent),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        '-${formatTime(d - shown)}',
                        style: NetflyType.meta.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                      ),
                    ],
                  ),
                  Positioned(
                    left: x - (_drag != null ? 9 : 7),
                    child: Container(
                      width: _drag != null ? 18 : 14,
                      height: _drag != null ? 18 : 14,
                      decoration: BoxDecoration(color: t.accent, shape: BoxShape.circle),
                    ),
                  ),
                  if (_drag != null)
                    Positioned(
                      left: (x - 80).clamp(0.0, box.maxWidth - 160),
                      bottom: 36,
                      child: Column(
                        children: [
                          if (cue != null)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: ThumbnailView(cue: cue),
                            )
                          else
                            const SizedBox.shrink(),
                          const SizedBox(height: 4),
                          Text(formatTime(_drag!), style: NetflyType.body.copyWith(fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
