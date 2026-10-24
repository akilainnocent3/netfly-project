// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checkout.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Checkout _$CheckoutFromJson(Map<String, dynamic> json) => Checkout(
  plan: Plan.fromJson(json['plan'] as Map<String, dynamic>),
  trial: json['trial'] as bool,
  trialDays: (json['trial_days'] as num).toInt(),
  steps: (json['steps'] as List<dynamic>).map((e) => e as String).toList(),
  amountTzs: (json['amount_tzs'] as num).toInt(),
  paymentPhone: json['payment_phone'] as String,
  paymentNetwork: json['payment_network'] as String?,
);

Map<String, dynamic> _$CheckoutToJson(Checkout instance) => <String, dynamic>{
  'plan': instance.plan,
  'trial': instance.trial,
  'trial_days': instance.trialDays,
  'steps': instance.steps,
  'amount_tzs': instance.amountTzs,
  'payment_phone': instance.paymentPhone,
  'payment_network': ?instance.paymentNetwork,
};
