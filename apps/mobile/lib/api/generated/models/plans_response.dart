// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'plan.dart';

part 'plans_response.g.dart';

@JsonSerializable()
class PlansResponse {
  const PlansResponse({
    required this.plans,
    required this.trialEnabled,
    required this.trialDays,
    required this.currency,
  });

  factory PlansResponse.fromJson(Map<String, Object?> json) => _$PlansResponseFromJson(json);

  final List<Plan> plans;
  @JsonKey(name: 'trial_enabled')
  final bool trialEnabled;
  @JsonKey(name: 'trial_days')
  final int trialDays;
  final String currency;

  Map<String, Object?> toJson() => _$PlansResponseToJson(this);
}
