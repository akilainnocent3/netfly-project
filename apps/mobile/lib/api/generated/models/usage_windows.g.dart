// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'usage_windows.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsageWindows _$UsageWindowsFromJson(Map<String, dynamic> json) => UsageWindows(
  day: (json['day'] as num?)?.toInt(),
  week: (json['week'] as num?)?.toInt(),
  month: (json['month'] as num?)?.toInt(),
);

Map<String, dynamic> _$UsageWindowsToJson(UsageWindows instance) => <String, dynamic>{
  'day': ?instance.day,
  'week': ?instance.week,
  'month': ?instance.month,
};
