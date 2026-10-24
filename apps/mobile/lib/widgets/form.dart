import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../brand/logo_mark.dart';
import '../core/theme.dart';

/// The web's dark form field: label floats, error under it, 44 px+ tall.
class NetflyField extends StatelessWidget {
  const NetflyField({
    super.key,
    required this.label,
    this.controller,
    this.error,
    this.obscure = false,
    this.keyboard,
    this.autofill,
    this.action = TextInputAction.next,
    this.onSubmitted,
    this.onChanged,
    this.suffix,
    this.helper,
    this.autofocus = false,
    this.formatters,
  });

  final String label;
  final TextEditingController? controller;
  final String? error;
  final bool obscure;
  final TextInputType? keyboard;
  final Iterable<String>? autofill;
  final TextInputAction action;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final Widget? suffix;
  final String? helper;
  final bool autofocus;
  final List<TextInputFormatter>? formatters;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(4),
      borderSide: BorderSide(color: c, width: w),
    );
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboard,
      autofillHints: autofill,
      textInputAction: action,
      onSubmitted: onSubmitted,
      onChanged: onChanged,
      autofocus: autofocus,
      inputFormatters: formatters,
      style: NetflyType.body.copyWith(color: t.text),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: NetflyType.body.copyWith(color: t.muted),
        errorText: error,
        helperText: helper,
        helperMaxLines: 3,
        errorMaxLines: 3,
        filled: true,
        fillColor: const Color(0xB3161616),
        suffixIcon: suffix,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
        enabledBorder: border(const Color(0xB3808080)),
        focusedBorder: border(Colors.white, 2),
        errorBorder: border(const Color(0xFFE87C03)),
        focusedErrorBorder: border(const Color(0xFFE87C03), 2),
      ),
    );
  }
}

/// Auth and checkout pages: mark at the top, a back button, the content in a column.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.children, this.step, this.title, this.subtitle, this.bottom});

  final List<Widget> children;
  final String? step;
  final String? title;
  final String? subtitle;
  final Widget? bottom;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const LogoMark(size: 28, semanticLabel: 'NETFLY'),
        centerTitle: true,
        leading: Navigator.of(context).canPop() ? const BackButton() : null,
      ),
      bottomNavigationBar: bottom == null
          ? null
          : SafeArea(
              child: Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 12), child: bottom),
            ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            if (step != null)
              Text(step!.toUpperCase(), style: NetflyType.caption.copyWith(color: t.muted, letterSpacing: 1)),
            if (title != null) ...[
              const SizedBox(height: 4),
              Semantics(
                header: true,
                child: Text(title!, style: NetflyType.h1.copyWith(color: t.text)),
              ),
            ],
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(subtitle!, style: NetflyType.body.copyWith(color: t.muted)),
            ],
            const SizedBox(height: 20),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// A form-level error, announced.
class FormError extends StatelessWidget {
  const FormError(this.message, {super.key});
  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFFE87C03), borderRadius: BorderRadius.circular(4)),
        child: Text(message!, style: NetflyType.body.copyWith(color: Colors.black)),
      ),
    );
  }
}
