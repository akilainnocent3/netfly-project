import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/api_error.dart';
import '../../core/public_config.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/form.dart';

/// Sign in with username, verified email or verified phone — submits only on the button or the
/// keyboard's Go (decision 8).
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key, this.next});
  final String? next;

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();
  bool _show = false;
  ApiError? _error;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_identifier.text.trim().isEmpty || _password.text.isEmpty) {
      setState(
        () => _error = const ApiError('validation_error', 'Enter your email, phone or username and your password.'),
      );
      return;
    }
    setState(() => _error = null);
    try {
      await ref.read(sessionProvider.notifier).signIn(_identifier.text, _password.text);
      TextInput.finishAutofillContext();
      if (mounted) context.go(widget.next ?? '/home');
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final site = ref.watch(publicConfigProvider).siteName;
    return AuthScaffold(
      title: 'Sign In',
      children: [
        AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FormError(_error?.fields.isEmpty ?? true ? _error?.message : null),
              NetflyField(
                label: 'Email, phone or username',
                controller: _identifier,
                autofill: const [AutofillHints.username, AutofillHints.email, AutofillHints.telephoneNumber],
                keyboard: TextInputType.emailAddress,
                error: _error?.fields['username'],
              ),
              const SizedBox(height: 14),
              NetflyField(
                label: 'Password',
                controller: _password,
                obscure: !_show,
                autofill: const [AutofillHints.password],
                action: TextInputAction.go,
                onSubmitted: (_) => _submit(),
                error: _error?.fields['password'],
                suffix: IconButton(
                  tooltip: _show ? 'Hide password' : 'Show password',
                  onPressed: () => setState(() => _show = !_show),
                  icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                ),
              ),
              const SizedBox(height: 20),
              NetflyButton(label: 'Sign in', size: NetflyButtonSize.lg, expand: true, onPressed: _submit),
              const SizedBox(height: 18),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('New to $site? ', style: NetflyType.body.copyWith(color: t.muted)),
                  TextButton(
                    onPressed: () => context.pushReplacement(
                      '/signup${widget.next == null ? '' : '?next=${Uri.encodeComponent(widget.next!)}'}',
                    ),
                    child: const Text(
                      'Sign up now',
                      style: TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}
