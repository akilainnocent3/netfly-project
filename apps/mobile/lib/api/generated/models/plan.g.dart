// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plan.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Plan _$PlanFromJson(Map<String, dynamic> json) => Plan(
  id: (json['id'] as num).toInt(),
  slug: json['slug'] as String,
  name: json['name'] as String,
  tagline: json['tagline'] as String,
  priceTzs: (json['price_tzs'] as num).toInt(),
  periodDays: (json['period_days'] as num).toInt(),
  dailyLimitMinutes: (json['daily_limit_minutes'] as num?)?.toInt(),
  weeklyLimitMinutes: (json['weekly_limit_minutes'] as num?)?.toInt(),
  monthlyLimitMinutes: (json['monthly_limit_minutes'] as num?)?.toInt(),
  trialEligible: json['trial_eligible'] as bool,
  isFree: json['is_free'] as bool,
  isDefault: json['is_default'] as bool,
  highlightLabel: json['highlight_label'] as String,
  order: (json['order'] as num).toInt(),
  featureBullets: (json['feature_bullets'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$PlanToJson(Plan instance) => <String, dynamic>{
  'id': instance.id,
  'slug': instance.slug,
  'name': instance.name,
  'tagline': instance.tagline,
  'price_tzs': instance.priceTzs,
  'period_days': instance.periodDays,
  'daily_limit_minutes': ?instance.dailyLimitMinutes,
  'weekly_limit_minutes': ?instance.weeklyLimitMinutes,
  'monthly_limit_minutes': ?instance.monthlyLimitMinutes,
  'trial_eligible': instance.trialEligible,
  'is_free': instance.isFree,
  'is_default': instance.isDefault,
  'highlight_label': instance.highlightLabel,
  'order': instance.order,
  'feature_bullets': instance.featureBullets,
};
