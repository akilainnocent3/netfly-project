import 'package:material_ui/material_ui.dart';

import '../core/theme.dart';
import 'buttons.dart';

/// The web's `ConfirmDialog` at phone width: a title, one paragraph, then the confirm button
/// (white, or red when [destructive]) above Cancel. Resolves to true only when the viewer
/// confirms (a tap outside or Back is Cancel).
Future<bool> confirm(
  BuildContext context, {
  required String title,
  required String body,
  required String confirmLabel,
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.75),
    builder: (context) {
      final t = NetflyTheme.of(context);
      return Dialog(
        backgroundColor: t.surface,
        insetPadding: const EdgeInsets.symmetric(horizontal: 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(NetflySpace.radiusCard),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Semantics(
                  header: true,
                  child: Text(title, style: NetflyType.h3.copyWith(color: t.text)),
                ),
                const SizedBox(height: 12),
                Text(body, style: NetflyType.body.copyWith(color: const Color(0xFFB3B3B3))),
                const SizedBox(height: 28),
                NetflyButton(
                  label: confirmLabel,
                  expand: true,
                  variant: destructive ? NetflyButtonVariant.accent : NetflyButtonVariant.play,
                  onPressed: () => Navigator.of(context).pop(true),
                ),
                const SizedBox(height: 12),
                NetflyButton(
                  label: cancelLabel,
                  expand: true,
                  variant: NetflyButtonVariant.secondary,
                  onPressed: () => Navigator.of(context).pop(false),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
  return result ?? false;
}
