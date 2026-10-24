import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/checkout.dart';
import '../../api/generated/models/checkout_start_request.dart';
import '../../api/generated/models/checkout_start_result_kind_enum.dart';
import '../../api/generated/models/payment.dart';
import '../../api/generated/models/payment_status_enum.dart';
import '../../api/generated/models/phone_override_request.dart';
import '../../brand/netfly_loader.dart';
import '../../core/api_error.dart';
import '../../core/format.dart';
import '../../core/http.dart';
import '../../core/public_config.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/form.dart';
import '../../widgets/state_message.dart';
import '../auth/verify_screen.dart';
import 'plans_screen.dart';

final _checkoutProvider = FutureProvider.autoDispose.family<Checkout, (String, bool)>((ref, key) {
  return ref.watch(apiProvider).billing.billingCheckout(plan: key.$1, trial: key.$2);
});

sealed class _Stage {}

class _Setup extends _Stage {}

class _Approve extends _Stage {
  _Approve(this.payment, this.startedAt);
  final Payment payment;
  final DateTime startedAt;
}

class _Paid extends _Stage {
  _Paid(this.payment, this.periodEnd);
  final Payment payment;
  final DateTime? periodEnd;
}

class _Trial extends _Stage {
  _Trial(this.trialEnd, this.phone);
  final DateTime trialEnd;
  final String phone;
}

/// The in-app checkout — native, no WebView — with the same steps and words as the web's
/// `/payment`: confirm the mobile-money number, Pay, approve the push on the phone with the PIN
/// ("Check your phone"), then You're all set. Amounts always come from the server-side plan.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key, required this.plan, this.trial = false, this.next});

  final String plan;
  final bool trial;
  final String? next;

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  _Stage _stage = _Setup();
  final _phone = TextEditingController();
  String? _phoneError;
  bool _prefilled = false;
  Timer? _poll;
  Timer? _tick;

  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    _phone.dispose();
    super.dispose();
  }

  String? _canonical(String typed) {
    var digits = typed.replaceAll(RegExp(r'\D'), '');
    if (digits.startsWith('0') && digits.length == 10) digits = '255${digits.substring(1)}';
    if (digits.length == 9 && RegExp(r'^[67]').hasMatch(digits)) digits = '255$digits';
    return RegExp(r'^255[67]\d{8}$').hasMatch(digits) ? digits : null;
  }

  Future<void> _pay(Checkout checkout) async {
    final phone = _canonical(_phone.text);
    if (phone == null) {
      setState(() => _phoneError = 'Enter a Tanzanian mobile-money number like 0712 345 678.');
      return;
    }
    setState(() => _phoneError = null);
    unawaited(HapticFeedback.mediumImpact());
    try {
      final result = await ref
          .read(apiProvider)
          .billing
          .billingCheckoutStart(
            body: CheckoutStartRequest(plan: checkout.plan.slug, trial: widget.trial, phone: phone),
          );
      if (result.kind == CheckoutStartResultKindEnum.trial) {
        setState(
          () => _stage = _Trial(
            result.subscription.trialEnd ?? DateTime.now().add(Duration(days: checkout.trialDays)),
            result.subscription.paymentPhoneMasked,
          ),
        );
      } else if (result.payment != null) {
        _approve(result.payment!);
      }
    } catch (e) {
      final error = ApiError.from(e);
      if (!mounted) return;
      if (error.code == 'verification_required') {
        context.pushReplacement('/verify/email?next=${Uri.encodeComponent(GoRouterState.of(context).uri.toString())}');
      } else if (error.code == 'validation_error') {
        setState(() => _phoneError = error.fields['phone'] ?? error.message);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  void _approve(Payment payment) {
    _poll?.cancel();
    _tick?.cancel();
    setState(() => _stage = _Approve(payment, DateTime.now()));
    final every = Duration(seconds: ref.read(publicConfigProvider).integer('payments.poll_seconds', 3));
    _poll = Timer.periodic(every, (_) async {
      final stage = _stage;
      if (stage is! _Approve) return;
      try {
        final p = await ref.read(apiProvider).billing.billingPayment(paymentId: stage.payment.id);
        if (!mounted) return;
        if (p.status == PaymentStatusEnum.completed) {
          _poll?.cancel();
          _tick?.cancel();
          unawaited(HapticFeedback.heavyImpact());
          DateTime? periodEnd;
          try {
            periodEnd = (await ref.read(apiProvider).billing.billingMembership()).subscription.currentPeriodEnd;
          } catch (_) {}
          if (mounted) setState(() => _stage = _Paid(p, periodEnd));
        } else {
          setState(() => _stage = _Approve(p, stage.startedAt));
        }
      } catch (_) {
        // Keep polling; the webhook or the reconcile job settles it server-side.
      }
    });
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  Future<void> _resend(Payment payment) async {
    try {
      final next = await ref
          .read(apiProvider)
          .billing
          .billingPaymentResend(paymentId: payment.id, body: const PhoneOverrideRequest());
      _approve(next);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('We sent a new request to ${next.phoneMasked}.')));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ApiError.from(e).message)));
    }
  }

  void _finish(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    context.go(widget.next ?? '/home');
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final config = ref.watch(publicConfigProvider);
    if (!mobileCheckoutEnabled(config)) {
      return Scaffold(
        appBar: AppBar(),
        body: StateMessage(
          title: 'Manage your plan on the web',
          body: 'Paid plans can be changed on the ${config.siteName} website. Sign in there with the same account.',
          icon: Icons.open_in_browser_rounded,
        ),
      );
    }
    final stage = _stage;
    if (stage is _Paid) {
      return _Success(
        title: "You're all set",
        body:
            'Your ${stage.payment.plan} plan is active.${stage.periodEnd == null ? '' : ' Your next payment is on ${longDate(stage.periodEnd!)}.'}',
        onDone: () => _finish('Welcome to ${stage.payment.plan}! Enjoy watching.'),
      );
    }
    if (stage is _Trial) {
      return _Success(
        title: 'Your free trial has started',
        body:
            "Enjoy until ${shortDate(stage.trialEnd)}. We'll send a payment request to ${stage.phone} on ${shortDate(stage.trialEnd)}.",
        onDone: () => _finish('Enjoy your free trial!'),
      );
    }
    if (stage is _Approve) return _approval(context, stage);

    final checkout = ref.watch(_checkoutProvider((widget.plan, widget.trial)));
    return switch (checkout) {
      AsyncData(:final value) => () {
        // A step still to do (verification lapsed): do it first.
        final first = value.steps.firstOrNull;
        if (first == 'email' || first == 'phone') {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              context.pushReplacement(
                '/verify/$first?next=${Uri.encodeComponent(GoRouterState.of(context).uri.toString())}',
              );
            }
          });
        }
        if (!_prefilled && value.paymentPhone.length == 12) {
          _prefilled = true;
          _phone.text = '0${value.paymentPhone.substring(3)}';
        }
        final network = networkOf(_phone.text);
        final price = widget.trial ? 'Free for ${value.trialDays} days' : formatTzs(value.amountTzs);
        return AuthScaffold(
          title: widget.trial ? 'Start your free trial' : 'Set up your payment',
          subtitle: widget.trial
              ? "No charge today. We'll ask for the first payment when your trial ends."
              : "Pay with mobile money. You'll approve it with your PIN on your phone.",
          bottom: NetflyButton(
            label: widget.trial ? 'Start free trial' : 'Pay ${formatTzs(value.amountTzs)}',
            size: NetflyButtonSize.lg,
            expand: true,
            onPressed: () => _pay(value),
          ),
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: t.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: t.line),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(value.plan.name, style: NetflyType.h3.copyWith(color: t.text)),
                  ),
                  Text(
                    price,
                    style: NetflyType.body.copyWith(fontWeight: FontWeight.w700, color: t.text),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final n in const ['vodacom', 'airtel', 'mixx', 'halotel'])
                  Opacity(opacity: network == null || network == n ? 1 : 0.35, child: NetworkChip(n)),
              ],
            ),
            const SizedBox(height: 14),
            NetflyField(
              label: 'Payment phone number',
              controller: _phone,
              keyboard: TextInputType.phone,
              autofill: const [AutofillHints.telephoneNumber],
              action: TextInputAction.done,
              error: _phoneError,
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) => _pay(value),
              helper: 'The number you pay with — M-Pesa, Airtel Money, Mixx by Yas or Halotel.',
            ),
          ],
        );
      }(),
      AsyncError(:final error) => Scaffold(
        appBar: AppBar(),
        body: StateMessage.error(error, onRetry: () => ref.invalidate(_checkoutProvider((widget.plan, widget.trial)))),
      ),
      _ => const Scaffold(body: LoaderScreen()),
    };
  }

  Widget _approval(BuildContext context, _Approve stage) {
    final t = NetflyTheme.of(context);
    final p = stage.payment;
    final timeout = ref.read(publicConfigProvider).integer('payments.approve_timeout_seconds', 120);
    final left = timeout - DateTime.now().difference(stage.startedAt).inSeconds;
    final failed =
        p.status == PaymentStatusEnum.failed ||
        p.status == PaymentStatusEnum.expired ||
        p.status == PaymentStatusEnum.voided;
    return AuthScaffold(
      title: failed ? "The payment didn't go through" : 'Check your phone',
      subtitle: failed
          ? (p.failureReason.isNotEmpty ? p.failureReason : 'It was declined or timed out. Nothing was charged.')
          : 'We sent a payment request for ${formatTzs(p.amount)} to ${p.phoneMasked}. Approve it with your mobile-money PIN.',
      children: [
        if (!failed) ...[
          const SizedBox(height: 12),
          const Center(
            child: NetflyLoader(label: 'Waiting for your approval…', delay: Duration.zero),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              left > 0
                  ? 'Waiting for approval… ${clock(Duration(seconds: left))}'
                  : 'Still waiting. Didn’t get the request?',
              style: NetflyType.body.copyWith(color: t.muted),
            ),
          ),
        ],
        const SizedBox(height: 24),
        if (failed || left <= 0)
          NetflyButton(label: failed ? 'Try again' : 'Send it again', expand: true, onPressed: () => _resend(p)),
        const SizedBox(height: 8),
        NetflyButton(
          label: 'Use a different number',
          expand: true,
          variant: NetflyButtonVariant.ghost,
          onPressed: () {
            _poll?.cancel();
            _tick?.cancel();
            setState(() => _stage = _Setup());
          },
        ),
      ],
    );
  }
}

class _Success extends StatelessWidget {
  const _Success({required this.title, required this.body, required this.onDone});

  final String title;
  final String body;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Icon(Icons.check_circle_rounded, size: 72, color: t.match),
              const SizedBox(height: 16),
              Semantics(
                liveRegion: true,
                child: Text(
                  title,
                  textAlign: TextAlign.center,
                  style: NetflyType.h1.copyWith(color: t.text),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                body,
                textAlign: TextAlign.center,
                style: NetflyType.body.copyWith(color: t.muted),
              ),
              const Spacer(),
              NetflyButton(label: 'Start watching', size: NetflyButtonSize.lg, expand: true, onPressed: onDone),
            ],
          ),
        ),
      ),
    );
  }
}
