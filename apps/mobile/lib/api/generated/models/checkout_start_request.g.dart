// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checkout_start_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CheckoutStartRequest _$CheckoutStartRequestFromJson(Map<String, dynamic> json) => CheckoutStartRequest(
  plan: json['plan'] as String,
  phone: json['phone'] as String?,
  trial: json['trial'] as bool? ?? false,
);

Map<String, dynamic> _$CheckoutStartRequestToJson(CheckoutStartRequest instance) => <String, dynamic>{
  'plan': instance.plan,
  'trial': instance.trial,
  'phone': ?instance.phone,
};
