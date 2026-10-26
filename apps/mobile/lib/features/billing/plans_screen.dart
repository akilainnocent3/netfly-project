import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/generated/models/choose_plan_request.dart';
import '../../api/generated/models/choose_plan_result_status_enum.dart';
import '../../api/generated/models/plan.dart';
import '../../api/generated/models/plans_response.dart';
import '../../api/generated/models/subscription_status_enum.dart';
import '../../brand/netfly_loader.dart';
import '../../core/api_error.dart';
import '../../core/format.dart';
import '../../core/http.dart';
import '../../core/public_config.dart';
import '../../core/theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/form.dart';
import '../../widgets/state_message.dart';
import '../account/membership_screen.dart';

final plansProvider = FutureProvider.autoDispose<PlansResponse>((ref) => ref.watch(apiProvider).billing.billingPlans());

/// Studio can switch the in-app mobile-money checkout off per store (store review — see
/// DECISIONS "Payments in the app"); members then manage their plan on the web.
bool mobileCheckoutEnabled(PublicConfig config) => switch (defaultTargetPlatform) {
  TargetPlatform.iOS => config.flag('payments.mobile_checkout_ios', true),
  _ => config.flag('payments.mobile_checkout_android', true),
};

/// The plan picker, as the web's: plans differ only in viewing time; the free plan is
/// preselected for new members, a member changing plans starts from the one they're on (its
/// button says Already enrolled); a paid plan or trial continues to verification and the
/// in-app payment.
class PlansScreen extends ConsumerStatefulWidget {
  const PlansScreen({super.key, this.from, this.next});

  final String? from;
  final String? next;

  @override
  ConsumerState<PlansScreen> createState() => _PlansScreenState();
}

class _PlansScreenState extends ConsumerState<PlansScreen> {
  String? _selected;
  bool _trial = false;
  ApiError? _error;

  Future<void> _continue(Plan plan) async {
    setState(() => _error = null);
    unawaited(HapticFeedback.lightImpact());
    try {
      final result = await ref
          .read(apiProvider)
          .billing
          .billingChoosePlan(
            body: ChoosePlanRequest(plan: plan.slug, trial: _trial),
          );
      if (!mounted) return;
      switch (result.status) {
        case ChoosePlanResultStatusEnum.needs:
          final checkout =
              '/checkout/${plan.slug}?${_trial ? 'trial=1&' : ''}next=${Uri.encodeComponent(widget.next ?? '/home')}';
          final step = result.steps.firstOrNull;
          if (step == 'email' || step == 'phone') {
            await context.push(
              '/verify/$step?next=${Uri.encodeComponent(result.steps.length > 1 && result.steps[1] != 'pay' ? '/verify/${result.steps[1]}?next=${Uri.encodeComponent(checkout)}' : checkout)}',
            );
          } else {
            await context.push(checkout);
          }
        case ChoosePlanResultStatusEnum.scheduled:
          ref.invalidate(membershipProvider);
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('${plan.name} starts when your current period ends.')));
          context.go(widget.next ?? '/account/membership');
        default:
          ref.invalidate(membershipProvider);
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text("You're on ${plan.name}. Enjoy watching!")));
          context.go(widget.next ?? '/home');
      }
    } catch (e) {
      setState(() => _error = ApiError.from(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    final plans = ref.watch(plansProvider);
    final checkoutOn = mobileCheckoutEnabled(ref.watch(publicConfigProvider));
    // New members start from the free plan; everyone else from the plan they're on.
    final membership = widget.from == 'signup' ? null : ref.watch(membershipProvider);
    final current = switch (membership?.value?.subscription) {
      final sub? when sub.status != SubscriptionStatusEnum.expired => sub.plan.slug,
      _ => null,
    };
    if (membership != null && membership.isLoading && !membership.hasValue) {
      return const Scaffold(body: LoaderScreen());
    }
    return switch (plans) {
      AsyncData(:final value) => () {
        final selected = value.plans.firstWhere(
          (p) => p.slug == (_selected ?? current),
          orElse: () => value.plans.firstWhere((p) => p.isDefault, orElse: () => value.plans.first),
        );
        final paid = !selected.isFree;
        final enrolled = selected.slug == current;
        return AuthScaffold(
          step: widget.from == 'signup' ? 'Last step' : null,
          title: 'Choose your plan',
          subtitle: 'Every plan streams in the same, best quality. Plans differ only in how much you watch.',
          bottom: enrolled
              ? const NetflyButton(
                  label: 'Already enrolled',
                  size: NetflyButtonSize.lg,
                  expand: true,
                  variant: NetflyButtonVariant.secondary,
                  onPressed: null,
                )
              : paid && !checkoutOn
              ? Text(
                  'Paid plans are managed on the ${ref.watch(publicConfigProvider).siteName} website for now.',
                  textAlign: TextAlign.center,
                  style: NetflyType.meta.copyWith(color: t.muted),
                )
              : NetflyButton(
                  label: paid ? (_trial ? 'Start free trial' : 'Continue') : 'Start watching',
                  size: NetflyButtonSize.lg,
                  expand: true,
                  onPressed: () => _continue(selected),
                ),
          children: [
            FormError(_error?.message),
            for (final plan in value.plans)
              _PlanCard(
                plan: plan,
                selected: plan.slug == selected.slug,
                current: plan.slug == current,
                onTap: () => setState(() {
                  _selected = plan.slug;
                  if (!plan.trialEligible) _trial = false;
                }),
              ),
            if (value.trialEnabled && selected.trialEligible && !enrolled)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _trial,
                onChanged: (v) => setState(() => _trial = v),
                title: Text('Start with a ${value.trialDays}-day free trial'),
                subtitle: const Text('No charge today. Cancel any time before it ends.'),
              ),
          ],
        );
      }(),
      AsyncError(:final error) => Scaffold(
        appBar: AppBar(),
        body: StateMessage.error(error, onRetry: () => ref.invalidate(plansProvider)),
      ),
      _ => const Scaffold(body: LoaderScreen()),
    };
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.selected, required this.current, required this.onTap});

  final Plan plan;
  final bool selected;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      label:
          '${plan.name}${current ? ', your current plan' : ''}, ${priceLabel(priceTzs: plan.priceTzs, periodDays: plan.periodDays, isFree: plan.isFree)}',
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: NetflyMotion.fast,
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: t.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? Colors.white : t.line, width: selected ? 2 : 1),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(gradient: planGradient(plan.order)),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(plan.name, style: NetflyType.h3.copyWith(color: Colors.white)),
                          if (plan.tagline.isNotEmpty)
                            Text(plan.tagline, style: NetflyType.meta.copyWith(color: Colors.white70)),
                        ],
                      ),
                    ),
                    if (current)
                      Container(
                        margin: const EdgeInsets.only(right: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          'YOUR PLAN',
                          style: NetflyType.caption.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ),
                    if (selected) const Icon(Icons.check_circle_rounded, color: Colors.white),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (plan.highlightLabel.isNotEmpty)
                      Text(
                        plan.highlightLabel.toUpperCase(),
                        style: NetflyType.caption.copyWith(
                          color: t.accent,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.6,
                        ),
                      ),
                    Text(
                      priceLabel(priceTzs: plan.priceTzs, periodDays: plan.periodDays, isFree: plan.isFree),
                      style: NetflyType.h2.copyWith(color: t.text),
                    ),
                    const SizedBox(height: 6),
                    _Line(
                      'Viewing time',
                      [
                        if (plan.dailyLimitMinutes != null) limitPhrase(plan.dailyLimitMinutes, 'day'),
                        if (plan.weeklyLimitMinutes != null) limitPhrase(plan.weeklyLimitMinutes, 'week'),
                        if (plan.monthlyLimitMinutes != null) limitPhrase(plan.monthlyLimitMinutes, 'month'),
                      ].join(' · ').ifEmpty('Unlimited'),
                    ),
                    const _Line('Video quality', 'Best (same on every plan)'),
                    for (final bullet in plan.featureBullets) _Line(null, bullet),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.value);
  final String? label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = NetflyTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_rounded, size: 16, color: t.muted),
          const SizedBox(width: 6),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  if (label != null)
                    TextSpan(
                      text: '$label: ',
                      style: TextStyle(color: t.muted),
                    ),
                  TextSpan(text: value),
                ],
              ),
              style: NetflyType.meta.copyWith(color: t.text),
            ),
          ),
        ],
      ),
    );
  }
}
