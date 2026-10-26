import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../brand/logo_mark.dart';
import '../core/theme.dart';

/// The web's white registration palette (registration-shell.tsx, light-field.tsx).
abstract final class RegColors {
  static const text = Color(0xFF333333);
  static const muted = Color(0xFF595959);
  static const label = Color(0xFF737373);
  static const border = Color(0xFF8C8C8C);
  static const line = Color(0xFFE6E6E6);
  static const focus = Color(0xFF0071EB);
  static const bad = Color(0xFFE50914);
  static const badText = Color(0xFFB20710);
  static const ok = Color(0xFF2F9E44);
  static const okText = Color(0xFF2F7A39);
}

/// The web's white registration layout: wordmark top left, Sign In top right, one question per
/// screen in a narrow column, the primary action pinned above the keyboard.
class RegistrationScaffold extends StatelessWidget {
  const RegistrationScaffold({super.key, required this.children, required this.action, this.onSignIn, this.onBack});

  final List<Widget> children;
  final Widget action;
  final VoidCallback? onSignIn;

  /// The ghost "Back" under the action (steps 2 and 3).
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      child: Theme(
        data: base.copyWith(
          colorScheme: base.colorScheme.copyWith(brightness: Brightness.light, surface: Colors.white),
          textSelectionTheme: const TextSelectionThemeData(
            cursorColor: RegColors.text,
            selectionColor: Color(0x330071EB),
            selectionHandleColor: RegColors.focus,
          ),
        ),
        child: Scaffold(
          backgroundColor: Colors.white,
          body: SafeArea(
            child: Column(
              children: [
                Container(
                  height: 64,
                  padding: const EdgeInsets.symmetric(horizontal: NetflySpace.gutter),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: RegColors.line)),
                  ),
                  child: Row(
                    children: [
                      const Wordmark(height: 28, letterColor: RegColors.text),
                      const Spacer(),
                      if (onSignIn != null)
                        TextButton(
                          onPressed: onSignIn,
                          style: TextButton.styleFrom(foregroundColor: RegColors.text),
                          child: Text('Sign In', style: NetflyType.lead.copyWith(fontWeight: FontWeight.w700)),
                        ),
                    ],
                  ),
                ),
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 440),
                      child: ListView(padding: const EdgeInsets.fromLTRB(16, 32, 16, 24), children: children),
                    ),
                  ),
                ),
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          action,
                          if (onBack != null)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: onBack,
                                style: TextButton.styleFrom(
                                  foregroundColor: RegColors.text,
                                  minimumSize: const Size(64, NetflySpace.touch),
                                ),
                                child: Text('Back', style: NetflyType.body.copyWith(fontWeight: FontWeight.w700)),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "STEP 1 OF 3" + heading + helper text.
class StepHeading extends StatelessWidget {
  const StepHeading({super.key, this.step, this.of, required this.title, this.helper});

  final int? step;
  final int? of;
  final String title;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    const bold = TextStyle(fontWeight: FontWeight.w700);
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (step != null)
            Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: 'STEP '),
                  TextSpan(text: '$step', style: bold),
                  const TextSpan(text: ' OF '),
                  TextSpan(text: '$of', style: bold),
                ],
              ),
              style: NetflyType.meta.copyWith(color: RegColors.text, letterSpacing: 0.4),
            ),
          const SizedBox(height: 4),
          Semantics(
            header: true,
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 28,
                height: 1.2,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.4,
                color: RegColors.text,
              ),
            ),
          ),
          if (helper != null) ...[
            const SizedBox(height: 12),
            Text(helper!, style: NetflyType.lead.copyWith(color: RegColors.text)),
          ],
        ],
      ),
    );
  }
}

enum FieldIndicator { none, checking, ok, bad }

/// The web's LightField: white box, 1 px #8C8C8C border, 4 px radius, 56 px tall, floating label,
/// blue focus ring; red border and message on error, green on a good value.
class LightField extends StatelessWidget {
  const LightField({
    super.key,
    required this.label,
    this.controller,
    this.error,
    this.hint,
    this.indicator = FieldIndicator.none,
    this.obscure = false,
    this.keyboard,
    this.autofill,
    this.action = TextInputAction.next,
    this.capitalization = TextCapitalization.none,
    this.onSubmitted,
    this.onChanged,
    this.trailing,
    this.autofocus = false,
    this.maxLength,
    this.formatters,
  });

  final String label;
  final TextEditingController? controller;
  final String? error;
  final Widget? hint;
  final FieldIndicator indicator;
  final bool obscure;
  final TextInputType? keyboard;
  final Iterable<String>? autofill;
  final TextInputAction action;
  final TextCapitalization capitalization;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final Widget? trailing;
  final bool autofocus;
  final int? maxLength;
  final List<TextInputFormatter>? formatters;

  @override
  Widget build(BuildContext context) {
    final bad = error != null || indicator == FieldIndicator.bad;
    final edge = bad
        ? RegColors.bad
        : indicator == FieldIndicator.ok
        ? RegColors.ok
        : RegColors.border;
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(NetflySpace.radiusButton),
      borderSide: BorderSide(color: c, width: w),
    );
    final Widget? icon = switch (indicator) {
      FieldIndicator.checking => const Padding(
        padding: EdgeInsets.all(14),
        child: SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2, color: RegColors.label)),
      ),
      FieldIndicator.ok => const Icon(Icons.check_circle_outline_rounded, color: RegColors.ok, size: 22),
      _ when bad => const Icon(Icons.error_outline_rounded, color: RegColors.bad, size: 22),
      _ => null,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          obscureText: obscure,
          keyboardType: keyboard,
          autofillHints: autofill,
          textInputAction: action,
          textCapitalization: capitalization,
          autocorrect: !obscure && capitalization != TextCapitalization.none,
          enableSuggestions: !obscure,
          onSubmitted: onSubmitted,
          onChanged: onChanged,
          autofocus: autofocus,
          maxLength: maxLength,
          inputFormatters: formatters,
          cursorColor: RegColors.text,
          style: NetflyType.lead.copyWith(color: RegColors.text, height: 1.2),
          decoration: InputDecoration(
            labelText: label,
            labelStyle: NetflyType.lead.copyWith(color: RegColors.label),
            floatingLabelStyle: NetflyType.meta.copyWith(color: RegColors.label),
            counterText: '',
            filled: true,
            fillColor: Colors.white,
            contentPadding: const EdgeInsets.fromLTRB(16, 18, 12, 18),
            suffixIcon: trailing == null && icon == null
                ? null
                : Row(mainAxisSize: MainAxisSize.min, children: [?icon, ?trailing, const SizedBox(width: 4)]),
            enabledBorder: border(edge),
            focusedBorder: border(bad ? RegColors.bad : RegColors.focus, 2),
          ),
        ),
        if (error != null)
          Semantics(
            liveRegion: true,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(2, 6, 2, 0),
              child: Text(error!, style: NetflyType.meta.copyWith(color: RegColors.badText)),
            ),
          )
        else if (hint != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 6, 2, 0),
            child: DefaultTextStyle.merge(
              style: NetflyType.meta.copyWith(color: RegColors.muted),
              child: hint!,
            ),
          ),
      ],
    );
  }
}
