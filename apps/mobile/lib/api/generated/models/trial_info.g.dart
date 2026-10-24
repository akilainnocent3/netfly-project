// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trial_info.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrialInfo _$TrialInfoFromJson(Map<String, dynamic> json) => TrialInfo(
  enabled: json['enabled'] as bool,
  days: (json['days'] as num).toInt(),
  eligible: json['eligible'] as bool,
);

Map<String, dynamic> _$TrialInfoToJson(TrialInfo instance) => <String, dynamic>{
  'enabled': instance.enabled,
  'days': instance.days,
  'eligible': instance.eligible,
};
