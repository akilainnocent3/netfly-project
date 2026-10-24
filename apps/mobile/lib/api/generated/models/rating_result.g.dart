// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rating_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RatingResult _$RatingResultFromJson(Map<String, dynamic> json) =>
    RatingResult(titleId: (json['title_id'] as num).toInt(), value: (json['value'] as num?)?.toInt());

Map<String, dynamic> _$RatingResultToJson(RatingResult instance) => <String, dynamic>{
  'title_id': instance.titleId,
  'value': ?instance.value,
};
