import 'package:material_ui/material_ui.dart';

import '../core/api_error.dart';
import '../core/theme.dart';
import 'buttons.dart';

/// Empty, error and offline states (the web's `StateMessage`): an icon, a title, a line of
/// help and at most one action.
class StateMessage extends StatelessWidget {
  const StateMessage({
    super.key,
    required this.title,
    this.body,
    this.icon,
    this.actionLabel,
    this.onAction,
    this.error = false,
  });

  /// An error from the API, with a "Try again".
  factory StateMessage.error(Object error, {VoidCallback? onRetry, String? title}) {
    final e = ApiError.from(error);
    return StateMessage(
      title: title ?? (e.isOffline ? "You're offline" : "We couldn't load this"),
      body: e.message,
      icon: e.isOffline ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
      actionLabel: onRetry == null ? null : 'Try again',
      onAction: onRetry,
      error: true,
    );
  }

  final String title;
  final String? body;
  final IconData? icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
        child: Semantics(
          liveRegion: error,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) Icon(icon, size: 40, color: error ? t.accent : t.muted),
              const SizedBox(height: 14),
              Text(
                title,
                textAlign: TextAlign.center,
                style: NetflyType.h3.copyWith(color: t.text),
              ),
              if (body != null) ...[
                const SizedBox(height: 6),
                Text(
                  body!,
                  textAlign: TextAlign.center,
                  style: NetflyType.body.copyWith(color: t.muted),
                ),
              ],
              if (actionLabel != null) ...[
                const SizedBox(height: 20),
                NetflyButton(label: actionLabel!, onPressed: onAction, variant: NetflyButtonVariant.secondary),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
