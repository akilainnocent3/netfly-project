// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'choose_plan_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChoosePlanRequest _$ChoosePlanRequestFromJson(Map<String, dynamic> json) =>
    ChoosePlanRequest(plan: json['plan'] as String, trial: json['trial'] as bool? ?? false);

Map<String, dynamic> _$ChoosePlanRequestToJson(ChoosePlanRequest instance) => <String, dynamic>{
  'plan': instance.plan,
  'trial': instance.trial,
};
