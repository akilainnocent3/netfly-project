// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trial_info.g.dart';

@JsonSerializable()
class TrialInfo {
  const TrialInfo({required this.enabled, required this.days, required this.eligible});

  factory TrialInfo.fromJson(Map<String, Object?> json) => _$TrialInfoFromJson(json);

  final bool enabled;
  final int days;
  final bool eligible;

  Map<String, Object?> toJson() => _$TrialInfoToJson(this);
}
