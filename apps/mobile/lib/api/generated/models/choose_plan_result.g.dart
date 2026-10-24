// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'choose_plan_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChoosePlanResult _$ChoosePlanResultFromJson(Map<String, dynamic> json) => ChoosePlanResult(
  status: ChoosePlanResultStatusEnum.fromJson(json['status'] as String),
  steps: (json['steps'] as List<dynamic>).map((e) => e as String).toList(),
  subscription: Subscription.fromJson(json['subscription'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ChoosePlanResultToJson(ChoosePlanResult instance) => <String, dynamic>{
  'status': instance.status,
  'steps': instance.steps,
  'subscription': instance.subscription,
};
