// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'plan.dart';

part 'checkout.g.dart';

@JsonSerializable()
class Checkout {
  const Checkout({
    required this.plan,
    required this.trial,
    required this.trialDays,
    required this.steps,
    required this.amountTzs,
    required this.paymentPhone,
    required this.paymentNetwork,
  });

  factory Checkout.fromJson(Map<String, Object?> json) => _$CheckoutFromJson(json);

  final Plan plan;
  final bool trial;
  @JsonKey(name: 'trial_days')
  final int trialDays;
  final List<String> steps;
  @JsonKey(name: 'amount_tzs')
  final int amountTzs;
  @JsonKey(name: 'payment_phone')
  final String paymentPhone;
  @JsonKey(name: 'payment_network')
  final String? paymentNetwork;

  Map<String, Object?> toJson() => _$CheckoutToJson(this);
}
