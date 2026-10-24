// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checkout_start_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CheckoutStartResult _$CheckoutStartResultFromJson(Map<String, dynamic> json) => CheckoutStartResult(
  kind: CheckoutStartResultKindEnum.fromJson(json['kind'] as String),
  payment: json['payment'] == null ? null : Payment.fromJson(json['payment'] as Map<String, dynamic>),
  subscription: Subscription.fromJson(json['subscription'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CheckoutStartResultToJson(CheckoutStartResult instance) => <String, dynamic>{
  'kind': instance.kind,
  'payment': ?instance.payment,
  'subscription': instance.subscription,
};
