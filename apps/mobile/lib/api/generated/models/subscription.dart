// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'plan.dart';
import 'subscription_status_enum.dart';

part 'subscription.g.dart';

@JsonSerializable()
class Subscription {
  const Subscription({
    required this.plan,
    required this.status,
    required this.currentPeriodStart,
    required this.currentPeriodEnd,
    required this.trialStart,
    required this.trialEnd,
    required this.autoRenew,
    required this.cancelAtPeriodEnd,
    required this.scheduledPlan,
    required this.paymentPhoneMasked,
    required this.paymentNetwork,
    required this.graceUntil,
  });

  factory Subscription.fromJson(Map<String, Object?> json) => _$SubscriptionFromJson(json);

  final Plan plan;
  final SubscriptionStatusEnum status;
  @JsonKey(name: 'current_period_start')
  final DateTime? currentPeriodStart;
  @JsonKey(name: 'current_period_end')
  final DateTime? currentPeriodEnd;
  @JsonKey(name: 'trial_start')
  final DateTime? trialStart;
  @JsonKey(name: 'trial_end')
  final DateTime? trialEnd;
  @JsonKey(name: 'auto_renew')
  final bool autoRenew;
  @JsonKey(name: 'cancel_at_period_end')
  final bool cancelAtPeriodEnd;
  @JsonKey(name: 'scheduled_plan')
  final Plan? scheduledPlan;
  @JsonKey(name: 'payment_phone_masked')
  final String paymentPhoneMasked;
  @JsonKey(name: 'payment_network')
  final String? paymentNetwork;
  @JsonKey(name: 'grace_until')
  final DateTime? graceUntil;

  Map<String, Object?> toJson() => _$SubscriptionToJson(this);
}
