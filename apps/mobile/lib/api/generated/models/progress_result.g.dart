// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'progress_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProgressResult _$ProgressResultFromJson(Map<String, dynamic> json) => ProgressResult(
  saved: (json['saved'] as num).toInt(),
  completed: (json['completed'] as List<dynamic>).map((e) => (e as num).toInt()).toList(),
);

Map<String, dynamic> _$ProgressResultToJson(ProgressResult instance) => <String, dynamic>{
  'saved': instance.saved,
  'completed': instance.completed,
};
