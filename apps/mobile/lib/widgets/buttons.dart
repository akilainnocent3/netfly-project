import 'dart:async';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../brand/netfly_loader.dart';
import '../core/theme.dart';

enum NetflyButtonVariant {
  /// White: only for starting playback (Play, Resume) — DECISIONS 51.
  play,

  /// Red: every other primary action.
  accent,

  /// Translucent grey (More info, My List).
  secondary,
  ghost,
}

enum NetflyButtonSize {
  sm(32, 12, 13),
  md(40, 20, 15),
  lg(48, 28, 18);

  const NetflyButtonSize(this.height, this.padding, this.font);
  final double height;
  final double padding;
  final double font;
}

/// The web's `Button`: disables at once when pressed and, if [onPressed] returns a future,
/// shows the `sm` logo loader (after its delay) until it completes. Key actions tap a haptic.
class NetflyButton extends StatefulWidget {
  const NetflyButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.variant = NetflyButtonVariant.accent,
    this.size = NetflyButtonSize.md,
    this.expand = false,
    this.loading = false,
    this.haptic = false,
    this.semanticLabel,
  });

  final String label;
  final FutureOr<void> Function()? onPressed;
  final IconData? icon;
  final NetflyButtonVariant variant;
  final NetflyButtonSize size;
  final bool expand;
  final bool loading;
  final bool haptic;
  final String? semanticLabel;

  @override
  State<NetflyButton> createState() => _NetflyButtonState();
}

class _NetflyButtonState extends State<NetflyButton> {
  bool _busy = false;

  Future<void> _press() async {
    if (_busy || widget.onPressed == null) return;
    if (widget.haptic) unawaited(HapticFeedback.lightImpact());
    final result = widget.onPressed!();
    if (result is Future) {
      setState(() => _busy = true);
      try {
        await result;
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final (bg, fg) = switch (widget.variant) {
      NetflyButtonVariant.play => (Colors.white, Colors.black),
      NetflyButtonVariant.accent => (t.accent, t.accentFg),
      NetflyButtonVariant.secondary => (t.secondaryButton, Colors.white),
      NetflyButtonVariant.ghost => (Colors.transparent, Colors.white.withValues(alpha: 0.8)),
    };
    final busy = _busy || widget.loading;
    final disabled = widget.onPressed == null;
    final s = widget.size;
    final content = Row(
      mainAxisSize: widget.expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (busy)
          SizedBox.square(
            dimension: s.font * 1.25,
            child: NetflyLoader(size: LoaderSize.sm, decorative: true, color: fg),
          )
        else if (widget.icon != null)
          Icon(widget.icon, size: s.font * 1.2, color: fg),
        if (widget.icon != null || busy) SizedBox(width: s.font * 0.5),
        Flexible(
          child: Text(
            widget.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: s.font, fontWeight: FontWeight.w700, color: fg, height: 1.2),
          ),
        ),
      ],
    );
    return Semantics(
      button: true,
      enabled: !disabled && !busy,
      label: widget.semanticLabel,
      child: Opacity(
        opacity: disabled ? 0.5 : 1,
        child: Material(
          color: bg,
          borderRadius: BorderRadius.circular(NetflySpace.radiusCard),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: disabled || busy ? null : _press,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: s.height < NetflySpace.touch ? NetflySpace.touch : s.height),
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: s.padding),
                child: Center(widthFactor: widget.expand ? null : 1, child: content),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A round icon button (the web's `icon-circle`): rate, My List in the title view.
class CircleIconButton extends StatelessWidget {
  const CircleIconButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.size = 40,
    this.filled = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final double size;
  final bool filled;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    child: SizedBox.square(
      dimension: size < NetflySpace.touch ? NetflySpace.touch : size,
      child: Center(
        child: Material(
          shape: CircleBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.5), width: 2)),
          color: filled ? Colors.white : Colors.black.withValues(alpha: 0.45),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed == null
                ? null
                : () {
                    unawaited(HapticFeedback.selectionClick());
                    onPressed!();
                  },
            child: SizedBox.square(
              dimension: size,
              child: Icon(icon, size: size * 0.5, color: filled ? Colors.black : Colors.white),
            ),
          ),
        ),
      ),
    ),
  );
}
