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

/// The web's `Button`: disables at once when pressed and, if [onPressed] returns a future (or
/// [loading] is set), stays muted with the `sm` logo loader over its label until it completes —
/// the label keeps the width and fades out only when the loader appears, so a fast save never
/// flickers. Then it returns to its normal state. Key actions tap a haptic.
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
    final content = _Veil(
      veiled: busy,
      child: Row(
        mainAxisSize: widget.expand ? MainAxisSize.max : MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (widget.icon != null) ...[Icon(widget.icon, size: s.font * 1.2, color: fg), SizedBox(width: s.font * 0.5)],
          Flexible(
            child: Text(
              widget.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: s.font, fontWeight: FontWeight.w700, color: fg, height: 1.2),
            ),
          ),
        ],
      ),
    );
    final body = Stack(
      alignment: Alignment.center,
      children: [
        content,
        if (busy)
          SizedBox.square(
            dimension: s.font * 1.25,
            child: NetflyLoader(size: LoaderSize.sm, decorative: true, color: fg),
          ),
      ],
    );
    return Semantics(
      button: true,
      enabled: !disabled && !busy,
      label: widget.semanticLabel,
      // Busy looks like disabled (the web's `disabled:opacity-50`): clearly already pressed.
      child: AnimatedOpacity(
        opacity: disabled || busy ? 0.5 : 1,
        duration: const Duration(milliseconds: 150),
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
                // heightFactor 1: in a Scaffold's bottom bar the height is loose up to the whole
                // screen, and a bare Center would fill it (hiding the form above).
                child: Center(widthFactor: widget.expand ? null : 1, heightFactor: 1, child: body),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The label under the loader: kept in place for the width, faded out after the loader's delay.
class _Veil extends StatefulWidget {
  const _Veil({required this.veiled, required this.child});

  final bool veiled;
  final Widget child;

  @override
  State<_Veil> createState() => _VeilState();
}

class _VeilState extends State<_Veil> {
  bool _hidden = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.veiled) _schedule();
  }

  @override
  void didUpdateWidget(_Veil old) {
    super.didUpdateWidget(old);
    if (widget.veiled && !old.veiled) _schedule();
    if (!widget.veiled && old.veiled) {
      _timer?.cancel();
      setState(() => _hidden = false);
    }
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer(const Duration(milliseconds: 200), () {
      if (mounted) setState(() => _hidden = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedOpacity(
    opacity: _hidden ? 0 : 1,
    duration: const Duration(milliseconds: 120),
    curve: Curves.easeOut,
    child: widget.child,
  );
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
