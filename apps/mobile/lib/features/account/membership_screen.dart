import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/auto_renew_request.dart';
import '../../api/generated/models/membership.dart';
import '../../api/generated/models/phone_override_request.dart';
import '../../api/generated/models/subscription.dart';
import '../../api/generated/models/subscription_status_enum.dart';
import '../../core/api_error.dart';
import '../../core/format.dart';
import '../../core/http.dart';
import '../../core/public_config.dart';
import '../../core/theme.dart';
import '../../widgets/brand_refresh.dart';
import '../../widgets/buttons.dart';
import '../../widgets/confirm_dialog.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_message.dart';
import '../billing/plans_screen.dart';

final membershipProvider = FutureProvider.autoDispose<Membership>(
  (ref) => ref.watch(apiProvider).billing.billingMembership(),
);

const _green = Color(0xFF46D369);
const _amber = Color(0xFFFFB35C);
const _red = Color(0xFFFF8A92);

/// Status pill: label and colour, as the web's membership card.
(String, Color) statusOf(SubscriptionStatusEnum status) => switch (status) {
  SubscriptionStatusEnum.trialing => ('Free trial', _green),
  SubscriptionStatusEnum.active => ('Active', _green),
  SubscriptionStatusEnum.pastDue => ('Payment due', _amber),
  SubscriptionStatusEnum.grace => ('Payment overdue', _amber),
  SubscriptionStatusEnum.canceled => ('Ends soon', Colors.white),
  SubscriptionStatusEnum.expired => ('Expired', _red),
  _ => ('Free plan', Colors.white),
};

/// What happens next, as one sentence (the web's `nextEvent`).
String nextEvent(Subscription sub) {
  const free = 'the free plan';
  final end = sub.currentPeriodEnd;
  if (sub.status == SubscriptionStatusEnum.trialing && sub.trialEnd != null) {
    return sub.paymentPhoneMasked.isNotEmpty
        ? "Your free trial ends on ${longDate(sub.trialEnd!)}. We'll send a payment request to ${sub.paymentPhoneMasked} that day."
        : 'Your free trial ends on ${longDate(sub.trialEnd!)}.';
  }
  if (sub.status == SubscriptionStatusEnum.pastDue || sub.status == SubscriptionStatusEnum.grace) {
    return sub.graceUntil != null
        ? "We couldn't take your last payment. You keep your plan until ${longDate(sub.graceUntil!)}; after that you move to $free."
        : "We couldn't take your last payment. We'll try again soon.";
  }
  if (sub.scheduledPlan != null && end != null) return "You'll move to ${sub.scheduledPlan!.name} on ${longDate(end)}.";
  if (sub.status == SubscriptionStatusEnum.canceled && end != null) {
    return 'Auto-renew is off. Your plan ends on ${longDate(end)}, then you move to $free.';
  }
  if (sub.status == SubscriptionStatusEnum.active && end != null) return 'Next payment on ${longDate(end)}.';
  return 'Watch for free every day. Upgrade anytime for more viewing time.';
}

/// Account → Membership: the plan card (status, what happens next, viewing limits, payment
/// phone) with Change plan, Renew now when a payment is due, and auto-renew on/off. Paid plans
/// are paid in the app with mobile money unless Studio turned the in-app checkout off for this
/// store; then the web manages them.
class MembershipScreen extends ConsumerStatefulWidget {
  const MembershipScreen({super.key});

  @override
  ConsumerState<MembershipScreen> createState() => _MembershipScreenState();
}

class _MembershipScreenState extends ConsumerState<MembershipScreen> {
  bool _busy = false;

  void _say(String message) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) _say(ApiError.from(e).message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setAutoRenew(Subscription sub, bool on) async {
    if (!on) {
      final trial = sub.status == SubscriptionStatusEnum.trialing;
      final end = sub.currentPeriodEnd;
      final ok = await confirm(
        context,
        title: trial ? 'Cancel your free trial?' : 'Turn off auto-renew?',
        body: trial
            ? "You keep ${sub.plan.name} until your trial ends, and we won't send a payment request. Then you move to the free plan."
            : 'You keep ${sub.plan.name} until ${end != null ? longDate(end) : 'the end of this period'}. After that you move to the free plan. You can turn it back on anytime before then.',
        confirmLabel: trial ? 'Cancel trial' : 'Turn off auto-renew',
        destructive: true,
      );
      if (!ok || !mounted) return;
    }
    await _run(() async {
      final updated = await ref.read(apiProvider).billing.billingAutoRenew(body: AutoRenewRequest(onValue: on));
      ref.invalidate(membershipProvider);
      if (!mounted) return;
      _say(
        on
            ? 'Auto-renew is back on. Your plan will renew.'
            : 'Auto-renew is off. You keep ${sub.plan.name} until ${updated.currentPeriodEnd != null ? shortDate(updated.currentPeriodEnd!) : 'the end of this period'}.',
      );
    });
  }

  Future<void> _renewNow() => _run(() async {
    unawaited(HapticFeedback.lightImpact());
    final payment = await ref.read(apiProvider).billing.billingRenewNow(body: const PhoneOverrideRequest());
    ref.invalidate(membershipProvider);
    if (mounted) _say('We sent a payment request to ${payment.phoneMasked}. Approve it on your phone with your PIN.');
  });

  @override
  Widget build(BuildContext context) {
    final membership = ref.watch(membershipProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Membership')),
      body: BrandRefresh(
        onRefresh: () => ref.refresh(membershipProvider.future),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(NetflySpace.gutter, 8, NetflySpace.gutter, 32),
          children: [
            // Keep the card while it reloads (after a change or pull-to-refresh): no flash.
            if (membership.value case final value?)
              _card(value.subscription)
            else if (membership.hasError)
              StateMessage.error(membership.error!, onRetry: () => ref.invalidate(membershipProvider))
            else
              const _CardSkeleton(),
          ],
        ),
      ),
    );
  }

  Widget _card(Subscription sub) {
    final t = NetflyTheme.of(context);
    final plan = sub.plan;
    final (label, tone) = statusOf(sub.status);
    final due = sub.status == SubscriptionStatusEnum.pastDue || sub.status == SubscriptionStatusEnum.grace;
    final paid = !plan.isFree && sub.status != SubscriptionStatusEnum.expired;
    final trial = sub.status == SubscriptionStatusEnum.trialing;
    final checkoutOn = mobileCheckoutEnabled(ref.watch(publicConfigProvider));
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: t.surface,
        borderRadius: BorderRadius.circular(NetflySpace.radiusCard),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
            decoration: BoxDecoration(gradient: planGradient(plan.order)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: [
                    _Pill('Membership', Colors.white, background: Colors.black.withValues(alpha: 0.25)),
                    _Pill(label, tone),
                  ],
                ),
                const SizedBox(height: 12),
                Text(plan.name, style: NetflyType.title.copyWith(color: Colors.white)),
                const SizedBox(height: 6),
                Text(
                  priceLabel(priceTzs: plan.priceTzs, periodDays: plan.periodDays, isFree: plan.isFree),
                  style: NetflyType.lead.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(nextEvent(sub), style: NetflyType.body.copyWith(color: t.text.withValues(alpha: 0.9))),
                const SizedBox(height: 16),
                _Limit('Daily viewing', limitPhrase(plan.dailyLimitMinutes, 'day')),
                _Limit('Weekly viewing', limitPhrase(plan.weeklyLimitMinutes, 'week')),
                _Limit('Monthly viewing', limitPhrase(plan.monthlyLimitMinutes, 'month')),
                if (sub.paymentPhoneMasked.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(Icons.smartphone_rounded, size: 18, color: t.muted),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          'Payment phone: ${sub.paymentPhoneMasked}${sub.paymentNetwork != null ? ' (${sub.paymentNetwork})' : ''}',
                          style: NetflyType.body.copyWith(color: t.text.withValues(alpha: 0.85)),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 20),
                if (checkoutOn) ...[
                  if (due) ...[
                    NetflyButton(label: 'Renew now', expand: true, loading: _busy, onPressed: _renewNow),
                    const SizedBox(height: 10),
                  ],
                  // One red primary: Renew when a payment is due, else Change plan.
                  NetflyButton(
                    label: 'Change plan',
                    expand: true,
                    variant: due ? NetflyButtonVariant.secondary : NetflyButtonVariant.accent,
                    onPressed: () =>
                        context.push('/plans?from=account&next=${Uri.encodeComponent('/account/membership')}'),
                  ),
                ] else
                  Text(
                    'Plans and payments are managed on the ${ref.watch(publicConfigProvider).siteName} website for now.',
                    style: NetflyType.meta.copyWith(color: t.muted),
                  ),
                if (paid) ...[
                  const SizedBox(height: 10),
                  NetflyButton(
                    label: sub.autoRenew
                        ? (trial ? 'Cancel trial' : 'Cancel auto-renew')
                        : (trial ? 'Keep my plan after the trial' : 'Resume auto-renew'),
                    expand: true,
                    variant: NetflyButtonVariant.secondary,
                    loading: _busy && !due,
                    onPressed: () => unawaited(_setAutoRenew(sub, !sub.autoRenew)), // the dialog, not the button, waits
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.label, this.color, {this.background});

  final String label;
  final Color color;
  final Color? background;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: background ?? color.withValues(alpha: 0.2),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      label.toUpperCase(),
      style: NetflyType.caption.copyWith(color: color, fontWeight: FontWeight.w700, letterSpacing: 0.8),
    ),
  );
}

class _Limit extends StatelessWidget {
  const _Limit(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: NetflyType.meta.copyWith(color: t.muted)),
          ),
          Text(
            value,
            style: NetflyType.body.copyWith(color: t.text, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _CardSkeleton extends StatelessWidget {
  const _CardSkeleton();

  @override
  Widget build(BuildContext context) => const Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Skeleton(height: 120),
      SizedBox(height: 16),
      Skeleton(height: 18, width: 220),
      SizedBox(height: 10),
      Skeleton(height: 18, width: 260),
    ],
  );
}
