// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_status_enum.dart';
import 'purpose_enum.dart';

part 'payment.g.dart';

@JsonSerializable()
class Payment {
  const Payment({
    required this.id,
    required this.reference,
    required this.status,
    required this.purpose,
    required this.plan,
    required this.planSlug,
    required this.amount,
    required this.currency,
    required this.phoneMasked,
    required this.network,
    required this.failureReason,
    required this.expiresAt,
    required this.completedAt,
    required this.createdAt,
  });

  factory Payment.fromJson(Map<String, Object?> json) => _$PaymentFromJson(json);

  final String id;
  final String? reference;
  final PaymentStatusEnum status;
  final PurposeEnum purpose;
  final String plan;
  @JsonKey(name: 'plan_slug')
  final String planSlug;
  final int amount;
  final String currency;
  @JsonKey(name: 'phone_masked')
  final String phoneMasked;
  final String network;
  @JsonKey(name: 'failure_reason')
  final String failureReason;
  @JsonKey(name: 'expires_at')
  final DateTime? expiresAt;
  @JsonKey(name: 'completed_at')
  final DateTime? completedAt;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$PaymentToJson(this);
}
