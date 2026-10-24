// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'checkout_start_result_kind_enum.dart';
import 'payment.dart';
import 'subscription.dart';

part 'checkout_start_result.g.dart';

@JsonSerializable()
class CheckoutStartResult {
  const CheckoutStartResult({required this.kind, required this.payment, required this.subscription});

  factory CheckoutStartResult.fromJson(Map<String, Object?> json) => _$CheckoutStartResultFromJson(json);

  final CheckoutStartResultKindEnum kind;
  final Payment? payment;
  final Subscription subscription;

  Map<String, Object?> toJson() => _$CheckoutStartResultToJson(this);
}
