// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resets.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Resets _$ResetsFromJson(Map<String, dynamic> json) => Resets(
  day: DateTime.parse(json['day'] as String),
  week: DateTime.parse(json['week'] as String),
  month: DateTime.parse(json['month'] as String),
);

Map<String, dynamic> _$ResetsToJson(Resets instance) => <String, dynamic>{
  'day': instance.day.toIso8601String(),
  'week': instance.week.toIso8601String(),
  'month': instance.month.toIso8601String(),
};
