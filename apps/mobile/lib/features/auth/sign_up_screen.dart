import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../brand/netfly_loader.dart';
import '../../core/api_error.dart';
import '../../core/http.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/form.dart';

/// Sign up in the web's three steps — name, username (checked as you type), password — then
/// the plan picker. Nothing submits by itself (decision 8).
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
  String? _error;
  Map<String, String> _fields = const {};

  // Live username check.
  Timer? _debounce;
  bool _checking = false;
  bool? _available;
  String? _usernameMessage;

  @override
  void dispose() {
    _debounce?.cancel();
    _name.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  void _onUsername(String value) {
    _debounce?.cancel();
    setState(() {
      _available = null;
      _usernameMessage = null;
    });
    if (value.trim().length < 3) return;
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _checking = true);
      try {
        final r = await ref.read(apiProvider).auth.authUsernameAvailable(username: value.trim());
        if (!mounted || _username.text.trim() != value.trim()) return;
        setState(() {
          _available = r.available;
          _usernameMessage = r.available ? 'Nice — it’s yours if you want it.' : r.message;
        });
      } catch (_) {
        // Checked again on submit.
      } finally {
        if (mounted) setState(() => _checking = false);
      }
    });
  }

  int _strength(String p) {
    var score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (RegExp(r'[A-Z]').hasMatch(p) && RegExp(r'[a-z]').hasMatch(p)) score++;
    if (RegExp(r'\d').hasMatch(p)) score++;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(p)) score++;
    return score.clamp(0, 4);
  }

  Future<void> _next() async {
    setState(() => _error = null);
    if (_step == 0) {
      if (_name.text.trim().isEmpty) return setState(() => _fields = {'full_name': 'Enter your name.'});
      setState(() {
        _fields = const {};
        _step = 1;
      });
    } else if (_step == 1) {
      if (_available != true) {
        return setState(() => _fields = {'username': _usernameMessage ?? 'Choose an available username.'});
      }
      setState(() {
        _fields = const {};
        _step = 2;
      });
    } else {
      if (_password.text.length < 8) return setState(() => _fields = {'password': 'Use at least 8 characters.'});
      try {
        await ref
            .read(sessionProvider.notifier)
            .signUp(username: _username.text, fullName: _name.text, password: _password.text);
        TextInput.finishAutofillContext();
        if (mounted) {
          context.go('/plans?from=signup${widget.next == null ? '' : '&next=${Uri.encodeComponent(widget.next!)}'}');
        }
      } on ApiError catch (e) {
        setState(() {
          _error = e.fields.isEmpty ? e.message : null;
          _fields = e.fields;
          if (e.fields.containsKey('username')) _step = 1;
          if (e.fields.containsKey('full_name')) _step = 0;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    const titles = ["What's your name?", 'Create your username', 'Create a password'];
    final strength = _strength(_password.text);
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _step--);
      },
      child: AuthScaffold(
        step: 'Step ${_step + 1} of 3',
        title: titles[_step],
        bottom: NetflyButton(
          label: _step == 2 ? 'Finish' : 'Next',
          size: NetflyButtonSize.lg,
          expand: true,
          onPressed: _next,
        ),
        children: [
          FormError(_error),
          AutofillGroup(
            child: AnimatedSwitcher(
              duration: NetflyMotion.base,
              child: switch (_step) {
                0 => NetflyField(
                  key: const ValueKey('name'),
                  label: 'Full name',
                  controller: _name,
                  autofocus: true,
                  autofill: const [AutofillHints.name],
                  error: _fields['full_name'],
                  onSubmitted: (_) => _next(),
                ),
                1 => NetflyField(
                  key: const ValueKey('username'),
                  label: 'Username',
                  controller: _username,
                  autofocus: true,
                  autofill: const [AutofillHints.newUsername],
                  onChanged: _onUsername,
                  onSubmitted: (_) => _next(),
                  error: _fields['username'] ?? (_available == false ? _usernameMessage : null),
                  helper: _available == true
                      ? _usernameMessage
                      : 'Letters, numbers and underscores. You can sign in with it.',
                  suffix: _checking
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: NetflyLoader(size: LoaderSize.sm, decorative: true, delay: Duration.zero),
                        )
                      : _available == true
                      ? Icon(Icons.check_circle_rounded, color: t.match)
                      : null,
                ),
                _ => Column(
                  key: const ValueKey('password'),
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    NetflyField(
                      label: 'Password',
                      controller: _password,
                      autofocus: true,
                      obscure: !_show,
                      autofill: const [AutofillHints.newPassword],
                      action: TextInputAction.done,
                      onChanged: (_) => setState(() {}),
                      onSubmitted: (_) => _next(),
                      error: _fields['password'],
                      suffix: IconButton(
                        tooltip: _show ? 'Hide password' : 'Show password',
                        onPressed: () => setState(() => _show = !_show),
                        icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Semantics(
                      label: 'Password strength ${['very weak', 'weak', 'fair', 'good', 'strong'][strength]}',
                      child: Row(
                        children: [
                          for (var i = 0; i < 4; i++)
                            Expanded(
                              child: Container(
                                height: 4,
                                margin: const EdgeInsets.only(right: 4),
                                color: i < strength
                                    ? (strength >= 3 ? t.match : const Color(0xFFE87C03))
                                    : Colors.white24,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              },
            ),
          ),
        ],
      ),
    );
  }
}
