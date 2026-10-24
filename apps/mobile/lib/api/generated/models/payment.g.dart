// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Payment _$PaymentFromJson(Map<String, dynamic> json) => Payment(
  id: json['id'] as String,
  reference: json['reference'] as String?,
  status: PaymentStatusEnum.fromJson(json['status'] as String),
  purpose: PurposeEnum.fromJson(json['purpose'] as String),
  plan: json['plan'] as String,
  planSlug: json['plan_slug'] as String,
  amount: (json['amount'] as num).toInt(),
  currency: json['currency'] as String,
  phoneMasked: json['phone_masked'] as String,
  network: json['network'] as String,
  failureReason: json['failure_reason'] as String,
  expiresAt: json['expires_at'] == null ? null : DateTime.parse(json['expires_at'] as String),
  completedAt: json['completed_at'] == null ? null : DateTime.parse(json['completed_at'] as String),
  createdAt: DateTime.parse(json['created_at'] as String),
);

Map<String, dynamic> _$PaymentToJson(Payment instance) => <String, dynamic>{
  'id': instance.id,
  'reference': ?instance.reference,
  'status': instance.status,
  'purpose': instance.purpose,
  'plan': instance.plan,
  'plan_slug': instance.planSlug,
  'amount': instance.amount,
  'currency': instance.currency,
  'phone_masked': instance.phoneMasked,
  'network': instance.network,
  'failure_reason': instance.failureReason,
  'expires_at': ?instance.expiresAt?.toIso8601String(),
  'completed_at': ?instance.completedAt?.toIso8601String(),
  'created_at': instance.createdAt.toIso8601String(),
};
