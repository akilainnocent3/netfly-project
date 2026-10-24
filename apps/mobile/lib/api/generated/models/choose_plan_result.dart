// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'choose_plan_result_status_enum.dart';
import 'subscription.dart';

part 'choose_plan_result.g.dart';

@JsonSerializable()
class ChoosePlanResult {
  const ChoosePlanResult({required this.status, required this.steps, required this.subscription});

  factory ChoosePlanResult.fromJson(Map<String, Object?> json) => _$ChoosePlanResultFromJson(json);

  final ChoosePlanResultStatusEnum status;
  final List<String> steps;
  final Subscription subscription;

  Map<String, Object?> toJson() => _$ChoosePlanResultToJson(this);
}
