// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'usage_plan.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsagePlan _$UsagePlanFromJson(Map<String, dynamic> json) =>
    UsagePlan(slug: json['slug'] as String, name: json['name'] as String, isFree: json['is_free'] as bool);

Map<String, dynamic> _$UsagePlanToJson(UsagePlan instance) => <String, dynamic>{
  'slug': instance.slug,
  'name': instance.name,
  'is_free': instance.isFree,
};
