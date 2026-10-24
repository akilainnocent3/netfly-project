// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'plan.g.dart';

@JsonSerializable()
class Plan {
  const Plan({
    required this.id,
    required this.slug,
    required this.name,
    required this.tagline,
    required this.priceTzs,
    required this.periodDays,
    required this.dailyLimitMinutes,
    required this.weeklyLimitMinutes,
    required this.monthlyLimitMinutes,
    required this.trialEligible,
    required this.isFree,
    required this.isDefault,
    required this.highlightLabel,
    required this.order,
    required this.featureBullets,
  });

  factory Plan.fromJson(Map<String, Object?> json) => _$PlanFromJson(json);

  final int id;
  final String slug;
  final String name;
  final String tagline;
  @JsonKey(name: 'price_tzs')
  final int priceTzs;
  @JsonKey(name: 'period_days')
  final int periodDays;
  @JsonKey(name: 'daily_limit_minutes')
  final int? dailyLimitMinutes;
  @JsonKey(name: 'weekly_limit_minutes')
  final int? weeklyLimitMinutes;
  @JsonKey(name: 'monthly_limit_minutes')
  final int? monthlyLimitMinutes;
  @JsonKey(name: 'trial_eligible')
  final bool trialEligible;
  @JsonKey(name: 'is_free')
  final bool isFree;
  @JsonKey(name: 'is_default')
  final bool isDefault;
  @JsonKey(name: 'highlight_label')
  final String highlightLabel;
  final int order;
  @JsonKey(name: 'feature_bullets')
  final List<String> featureBullets;

  Map<String, Object?> toJson() => _$PlanToJson(this);
}
