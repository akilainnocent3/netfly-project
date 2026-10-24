// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subscription.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Subscription _$SubscriptionFromJson(Map<String, dynamic> json) => Subscription(
  plan: Plan.fromJson(json['plan'] as Map<String, dynamic>),
  status: SubscriptionStatusEnum.fromJson(json['status'] as String),
  currentPeriodStart: json['current_period_start'] == null
      ? null
      : DateTime.parse(json['current_period_start'] as String),
  currentPeriodEnd: json['current_period_end'] == null ? null : DateTime.parse(json['current_period_end'] as String),
  trialStart: json['trial_start'] == null ? null : DateTime.parse(json['trial_start'] as String),
  trialEnd: json['trial_end'] == null ? null : DateTime.parse(json['trial_end'] as String),
  autoRenew: json['auto_renew'] as bool,
  cancelAtPeriodEnd: json['cancel_at_period_end'] as bool,
  scheduledPlan: json['scheduled_plan'] == null ? null : Plan.fromJson(json['scheduled_plan'] as Map<String, dynamic>),
  paymentPhoneMasked: json['payment_phone_masked'] as String,
  paymentNetwork: json['payment_network'] as String?,
  graceUntil: json['grace_until'] == null ? null : DateTime.parse(json['grace_until'] as String),
);

Map<String, dynamic> _$SubscriptionToJson(Subscription instance) => <String, dynamic>{
  'plan': instance.plan,
  'status': instance.status,
  'current_period_start': ?instance.currentPeriodStart?.toIso8601String(),
  'current_period_end': ?instance.currentPeriodEnd?.toIso8601String(),
  'trial_start': ?instance.trialStart?.toIso8601String(),
  'trial_end': ?instance.trialEnd?.toIso8601String(),
  'auto_renew': instance.autoRenew,
  'cancel_at_period_end': instance.cancelAtPeriodEnd,
  'scheduled_plan': ?instance.scheduledPlan,
  'payment_phone_masked': instance.paymentPhoneMasked,
  'payment_network': ?instance.paymentNetwork,
  'grace_until': ?instance.graceUntil?.toIso8601String(),
};
