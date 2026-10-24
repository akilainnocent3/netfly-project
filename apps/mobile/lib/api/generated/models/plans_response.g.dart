// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plans_response.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlansResponse _$PlansResponseFromJson(Map<String, dynamic> json) => PlansResponse(
  plans: (json['plans'] as List<dynamic>).map((e) => Plan.fromJson(e as Map<String, dynamic>)).toList(),
  trialEnabled: json['trial_enabled'] as bool,
  trialDays: (json['trial_days'] as num).toInt(),
  currency: json['currency'] as String,
);

Map<String, dynamic> _$PlansResponseToJson(PlansResponse instance) => <String, dynamic>{
  'plans': instance.plans,
  'trial_enabled': instance.trialEnabled,
  'trial_days': instance.trialDays,
  'currency': instance.currency,
};
