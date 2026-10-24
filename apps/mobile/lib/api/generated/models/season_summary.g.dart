// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'season_summary.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeasonSummary _$SeasonSummaryFromJson(Map<String, dynamic> json) => SeasonSummary(
  id: (json['id'] as num).toInt(),
  number: (json['number'] as num).toInt(),
  displayName: json['display_name'] as String,
  episodeCount: (json['episode_count'] as num).toInt(),
  name: json['name'] as String?,
);

Map<String, dynamic> _$SeasonSummaryToJson(SeasonSummary instance) => <String, dynamic>{
  'id': instance.id,
  'number': instance.number,
  'name': ?instance.name,
  'display_name': instance.displayName,
  'episode_count': instance.episodeCount,
};
