import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/code_sent.dart';
import '../../api/generated/models/confirm_request.dart';
import '../../api/generated/models/start_request.dart';
import '../../core/api_error.dart';
import '../../core/http.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/form.dart';

/// Mobile-money networks by Tanzanian prefix (backend/apps/accounts/phone.py, apps/client/src/lib/phone.ts).
const _networks = {
  'vodacom': ('Vodacom M-Pesa', Color(0xFFE60000)),
  'airtel': ('Airtel Money', Color(0xFFD71920)),
  'mixx': ('Mixx by Yas', Color(0xFF1D4ED8)),
  'halotel': ('Halotel', Color(0xFFF26522)),
};
const _prefixes = {
  '74': 'vodacom', '75': 'vodacom', '76': 'vodacom', '79': 'vodacom', //
  '68': 'airtel', '69': 'airtel', '78': 'airtel',
  '65': 'mixx', '67': 'mixx', '71': 'mixx', '77': 'mixx',
  '61': 'halotel', '62': 'halotel',
};

/// The network a local Tanzanian number belongs to (a hint only; the server validates).
String? networkOf(String typed) {
  var digits = typed.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('255')) digits = digits.substring(3);
  if (digits.startsWith('0')) digits = digits.substring(1);
  return digits.length == 9 ? _prefixes[digits.substring(0, 2)] : null;
}

class NetworkChip extends StatelessWidget {
  const NetworkChip(this.network, {super.key});
  final String network;

  @override
  Widget build(BuildContext context) {
    final (label, color) = _networks[network] ?? (network, Colors.grey);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
      child: Text(
        label,
        style: NetflyType.caption.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Verify an email or a phone number: the address, then the code (the same endpoints as the web,
/// so a failed SMS shows the server's clear message — "We couldn't send a text to this number…").
class VerifyScreen extends ConsumerStatefulWidget {
  const VerifyScreen({super.key, required this.channel, this.next});

  final String channel;
  final String? next;

  @override
  ConsumerState<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends ConsumerState<VerifyScreen> {
  final _value = TextEditingController();
  final _code = TextEditingController();
  CodeSent? _sent;
  ApiError? _error;
  DateTime _resendAt = DateTime.now();
  Timer? _tick;
  bool _checking = false;

  bool get _phone => widget.channel == 'phone';

  @override
  void initState() {
    super.initState();
    final user = ref.read(userProvider);
    _value.text = (_phone ? _localPhone(user?.phone) : user?.email) ?? '';
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  static String? _localPhone(String? digits) {
    if (digits == null) return null;
    return digits.startsWith('255') && digits.length == 12 ? '0${digits.substring(3)}' : '+$digits';
  }

  @override
  void dispose() {
    _tick?.cancel();
    _value.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _error = null);
    try {
      final sent = await ref
          .read(apiProvider)
          .auth
          .verifyStart(
            channel: widget.channel,
            body: StartRequest(value: _value.text.trim()),
          );
      setState(() {
        _sent = sent;
        _code.clear();
        _resendAt = DateTime.now().add(Duration(seconds: sent.resendIn));
      });
    } catch (e) {
      final error = ApiError.from(e);
      setState(() {
        _error = error;
        final wait = error.extra['retry_in'];
        if (error.code == 'resend_cooldown' && wait is num) {
          _resendAt = DateTime.now().add(Duration(seconds: wait.toInt()));
        }
      });
    }
  }

  Future<void> _confirm(String code) async {
    if (_checking) return;
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .auth
          .verifyConfirm(
            channel: widget.channel,
            body: ConfirmRequest(code: code),
          );
      unawaited(HapticFeedback.mediumImpact());
      final me = await ref.read(apiProvider).auth.authMe();
      ref.read(sessionProvider.notifier).updateUser(me);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(_phone ? 'Phone number verified' : 'Email verified')));
      if (widget.next != null) {
        context.go(widget.next!);
      } else {
        context.pop();
      }
    } catch (e) {
      setState(() {
        _error = ApiError.from(e);
        _code.clear();
      });
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final sent = _sent;
    final resendIn = _resendAt.difference(DateTime.now()).inSeconds;
    if (sent == null) {
      final network = _phone ? networkOf(_value.text) : null;
      return AuthScaffold(
        title: _phone ? "What's your mobile number?" : "What's your email?",
        subtitle: _phone
            ? "We'll text you a code. Use the number you pay with — M-Pesa, Airtel Money, Mixx by Yas or Halotel."
            : "We'll send you a code to confirm it. We use it for receipts and to help you get back into your account.",
        bottom: NetflyButton(label: 'Send code', size: NetflyButtonSize.lg, expand: true, onPressed: _send),
        children: [
          FormError(_error?.fields.isEmpty ?? true ? _error?.message : null),
          NetflyField(
            label: _phone ? 'Mobile number' : 'Email address',
            controller: _value,
            autofocus: true,
            keyboard: _phone ? TextInputType.phone : TextInputType.emailAddress,
            autofill: [_phone ? AutofillHints.telephoneNumber : AutofillHints.email],
            action: TextInputAction.send,
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _send(),
            error: _error?.fields['value'],
            helper: _phone ? 'For example 0712 345 678' : null,
          ),
          if (network != null) ...[
            const SizedBox(height: 10),
            Align(alignment: Alignment.centerLeft, child: NetworkChip(network)),
          ],
        ],
      );
    }
    return AuthScaffold(
      title: 'Enter the code we sent',
      subtitle: 'We sent a ${sent.length}-digit code to ${sent.sentTo}.',
      children: [
        FormError(_error?.message),
        _CodeBoxes(controller: _code, length: sent.length, enabled: !_checking, onComplete: _confirm),
        const SizedBox(height: 20),
        Row(
          children: [
            TextButton(
              onPressed: resendIn > 0 || _checking ? null : _send,
              child: Text(resendIn > 0 ? 'Resend code in ${resendIn}s' : 'Resend code'),
            ),
            const Spacer(),
            TextButton(
              onPressed: () => setState(() {
                _sent = null;
                _error = null;
              }),
              child: Text(_phone ? 'Use a different number' : 'Change email', style: TextStyle(color: t.muted)),
            ),
          ],
        ),
      ],
    );
  }
}

/// One field shown as boxes; the OS offers the code from the SMS (one-time-code autofill), and a
/// complete code submits itself — the app's one auto-submit, as on the web (decision 41).
class _CodeBoxes extends StatelessWidget {
  const _CodeBoxes({required this.controller, required this.length, required this.enabled, required this.onComplete});

  final TextEditingController controller;
  final int length;
  final bool enabled;
  final ValueChanged<String> onComplete;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Stack(
      children: [
        ListenableBuilder(
          listenable: controller,
          builder: (context, _) => Row(
            children: [
              for (var i = 0; i < length; i++)
                Expanded(
                  child: Container(
                    height: 56,
                    margin: EdgeInsets.only(right: i == length - 1 ? 0 : 8),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: const Color(0xB3161616),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: i == controller.text.length ? Colors.white : t.subtle,
                        width: i == controller.text.length ? 2 : 1,
                      ),
                    ),
                    child: Text(
                      i < controller.text.length ? controller.text[i] : '',
                      style: NetflyType.h3.copyWith(color: t.text),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Positioned.fill(
          child: Opacity(
            opacity: 0.01,
            child: TextField(
              controller: controller,
              enabled: enabled,
              autofocus: true,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: length,
              showCursor: false,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                counterText: '',
                border: InputBorder.none,
                labelText: 'Verification code, $length digits',
              ),
              onChanged: (value) {
                if (value.length == length) onComplete(value);
              },
            ),
          ),
        ),
      ],
    );
  }
}
