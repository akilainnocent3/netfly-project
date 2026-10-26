import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/api_error.dart';
import '../../core/http.dart';
import '../../core/public_config.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/form.dart';
import '../../widgets/registration.dart';

final _usernameRe = RegExp(r'^[A-Za-z0-9_]{3,30}$');

/// Sign up in the web's three white steps — name, username (checked as you type), password —
/// then the plan picker. Nothing submits by itself (decision 8).
class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key, this.next});
  final String? next;

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  int _step = 0;
  final _name = TextEditingController();
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _show = false;
  bool _submitting = false;
  String? _error;
  Map<String, String> _fields = const {};

  // Live username check.
  Timer? _debounce;
  bool _checking = false;
  ({String name, bool ok, String message})? _availability;

  @override
  void dispose() {
    _debounce?.cancel();
    _name.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  String get _trimmed => _username.text.trim();

  String? _formatError(String v) {
    if (v.length < 3) return null;
    if (v.length > 30) return 'Usernames can be at most 30 characters.';
    if (!_usernameRe.hasMatch(v)) return 'Use only letters, numbers and underscores.';
    return null;
  }

  void _onUsername(String _) {
    _debounce?.cancel();
    final value = _trimmed;
    setState(() {
      _fields = const {};
      _checking = _usernameRe.hasMatch(value);
    });
    if (!_checking) return;
    final wait = ref.read(publicConfigProvider).integer('ux.username_check_debounce_ms', 400);
    _debounce = Timer(Duration(milliseconds: wait), () async {
      try {
        final r = await ref.read(apiProvider).auth.authUsernameAvailable(username: value);
        if (!mounted) return;
        setState(() => _availability = (name: r.username, ok: r.available, message: r.message));
      } catch (_) {
        // Checked again on submit.
      } finally {
        if (mounted && _trimmed == value) setState(() => _checking = false);
      }
    });
  }

  ({String name, bool ok, String message})? get _known =>
      _availability?.name.toLowerCase() == _trimmed.toLowerCase() ? _availability : null;

  bool get _usernameOk => _usernameRe.hasMatch(_trimmed) && _known?.ok == true && !_checking;

  int _strength(String p) {
    var score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (RegExp(r'[A-Z]').hasMatch(p) && RegExp(r'[a-z]').hasMatch(p)) score++;
    if (RegExp(r'\d').hasMatch(p)) score++;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(p)) score++;
    return score.clamp(0, 4);
  }

  void _go(int step) => setState(() {
    _step = step;
    _error = null;
  });

  Future<void> _next() async {
    if (_submitting) return;
    setState(() => _error = null);
    if (_step == 0) {
      final value = _name.text.trim().replaceAll(RegExp(r'\s+'), ' ');
      if (value.isEmpty) return setState(() => _fields = {'full_name': 'Please tell us your name.'});
      if (value.length > 120) return setState(() => _fields = {'full_name': 'That name is too long.'});
      _name.text = value;
      setState(() => _fields = const {});
      _go(1);
    } else if (_step == 1) {
      if (!_usernameOk) return;
      setState(() => _fields = const {});
      _go(2);
    } else {
      final min = ref.read(publicConfigProvider).integer('auth.password_min_length', 8);
      if (_password.text.length < min) {
        return setState(() => _fields = {'password': 'Use at least $min characters.'});
      }
      setState(() => _submitting = true);
      try {
        await ref
            .read(sessionProvider.notifier)
            .signUp(username: _trimmed, fullName: _name.text, password: _password.text);
        TextInput.finishAutofillContext();
        if (mounted) {
          context.go('/plans?from=signup${widget.next == null ? '' : '&next=${Uri.encodeComponent(widget.next!)}'}');
        }
      } on ApiError catch (e) {
        if (!mounted) return;
        // Errors go back to the step that owns the field.
        setState(() {
          _submitting = false;
          _error = e.fields.isEmpty ? e.message : null;
          _fields = e.fields;
          if (e.fields.containsKey('username')) _step = 1;
          if (e.fields.containsKey('full_name')) _step = 0;
        });
      } catch (_) {
        if (mounted) {
          setState(() {
            _submitting = false;
            _error = 'Something went wrong. Please try again.';
          });
        }
      }
    }
  }

  void _signIn() =>
      context.pushReplacement('/signin${widget.next == null ? '' : '?next=${Uri.encodeComponent(widget.next!)}'}');

  @override
  Widget build(BuildContext context) {
    final min = ref.watch(publicConfigProvider).integer('auth.password_min_length', 8);
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _go(_step - 1);
      },
      child: RegistrationScaffold(
        onSignIn: _signIn,
        onBack: _step == 0 ? null : () => _go(_step - 1),
        action: NetflyButton(
          label: _step == 2 ? 'Finish' : 'Next',
          size: NetflyButtonSize.lg,
          expand: true,
          loading: _submitting,
          onPressed: _step == 1 && !_usernameOk ? null : _next,
        ),
        children: [
          AutofillGroup(
            child: AnimatedSwitcher(
              duration: NetflyMotion.base,
              transitionBuilder: (child, a) => FadeTransition(
                opacity: a,
                child: SlideTransition(
                  position: Tween(begin: const Offset(0.06, 0), end: Offset.zero).animate(a),
                  child: child,
                ),
              ),
              layoutBuilder: (current, previous) =>
                  Stack(alignment: Alignment.topCenter, children: [...previous, ?current]),
              child: switch (_step) {
                0 => _nameStep(),
                1 => _usernameStep(),
                _ => _passwordStep(min),
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _nameStep() => Column(
    key: const ValueKey('name'),
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const StepHeading(step: 1, of: 3, title: "What's your name?", helper: 'This is how we’ll greet you.'),
      LightField(
        label: 'Full name',
        controller: _name,
        autofocus: true,
        maxLength: 120,
        capitalization: TextCapitalization.words,
        keyboard: TextInputType.name,
        autofill: const [AutofillHints.name],
        error: _fields['full_name'],
        onChanged: (_) {
          if (_fields.isNotEmpty) setState(() => _fields = const {});
        },
        onSubmitted: (_) => _next(),
      ),
    ],
  );

  Widget _usernameStep() {
    final known = _known;
    final error =
        _fields['username'] ??
        _formatError(_trimmed) ??
        (known != null && !known.ok && !_checking ? known.message : null);
    final indicator = _trimmed.length < 3
        ? FieldIndicator.none
        : _checking
        ? FieldIndicator.checking
        : _usernameOk
        ? FieldIndicator.ok
        : error != null
        ? FieldIndicator.bad
        : FieldIndicator.none;
    return Column(
      key: const ValueKey('username'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const StepHeading(
          step: 2,
          of: 3,
          title: 'Create your username',
          helper: 'You’ll use it to sign in. Letters, numbers and underscores.',
        ),
        Semantics(
          liveRegion: true,
          label: _checking
              ? 'Checking availability'
              : _usernameOk
              ? 'Username available'
              : null,
          child: LightField(
            label: 'Username',
            controller: _username,
            autofocus: true,
            maxLength: 30,
            keyboard: TextInputType.visiblePassword, // no autocorrect, no spaces suggested
            autofill: const [AutofillHints.newUsername],
            formatters: [FilteringTextInputFormatter.deny(RegExp(r'\s'))],
            indicator: indicator,
            error: error,
            hint: _usernameOk
                ? const Text('Nice — it’s yours if you want it.', style: TextStyle(color: RegColors.okText))
                : null,
            onChanged: _onUsername,
            onSubmitted: (_) => _next(),
          ),
        ),
      ],
    );
  }

  Widget _passwordStep(int min) {
    final password = _password.text;
    final strength = _strength(password);
    const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const bars = [Color(0xFFE50914), Color(0xFFE87C03), Color(0xFFD9A400), Color(0xFF5AA02C), Color(0xFF2F9E44)];
    return Column(
      key: const ValueKey('password'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        StepHeading(
          step: 3,
          of: 3,
          title: 'Create a password',
          helper: 'At least $min characters. A longer phrase is stronger and easier to remember.',
        ),
        LightField(
          label: 'Password',
          controller: _password,
          autofocus: true,
          obscure: !_show,
          autofill: const [AutofillHints.newPassword],
          action: TextInputAction.done,
          error: _fields['password'],
          onChanged: (_) => setState(() => _fields = const {}),
          onSubmitted: (_) => _next(),
          trailing: TextButton(
            onPressed: () => setState(() => _show = !_show),
            style: TextButton.styleFrom(foregroundColor: RegColors.muted, minimumSize: const Size(56, 44)),
            child: Text(
              _show ? 'HIDE' : 'SHOW',
              semanticsLabel: _show ? 'Hide password' : 'Show password',
              style: NetflyType.meta.copyWith(fontWeight: FontWeight.w700, letterSpacing: 0.5),
            ),
          ),
        ),
        const SizedBox(height: 12),
        AnimatedOpacity(
          opacity: password.isEmpty ? 0 : 1,
          duration: NetflyMotion.fast,
          child: Semantics(
            label: password.isEmpty ? null : 'Password strength: ${labels[strength]}',
            child: Row(
              children: [
                for (var i = 0; i < 4; i++)
                  Expanded(
                    child: Container(
                      height: 6,
                      margin: const EdgeInsets.only(right: 4),
                      decoration: BoxDecoration(color: const Color(0xFFE6E6E6), borderRadius: BorderRadius.circular(3)),
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: strength > i ? 1 : (strength == i && password.isNotEmpty ? 0.35 : 0),
                        child: AnimatedContainer(
                          duration: NetflyMotion.slow,
                          decoration: BoxDecoration(color: bars[strength], borderRadius: BorderRadius.circular(3)),
                        ),
                      ),
                    ),
                  ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 72,
                  child: Text(
                    labels[strength],
                    textAlign: TextAlign.right,
                    style: NetflyType.meta.copyWith(color: RegColors.muted),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_error != null) ...[const SizedBox(height: 20), FormError(_error)],
      ],
    );
  }
}
