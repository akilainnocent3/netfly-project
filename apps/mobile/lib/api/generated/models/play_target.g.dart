// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'play_target.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlayTarget _$PlayTargetFromJson(Map<String, dynamic> json) => PlayTarget(
  action: PlayTargetActionEnum.fromJson(json['action'] as String),
  label: json['label'] as String,
  episodeId: (json['episode_id'] as num?)?.toInt(),
  seasonNumber: (json['season_number'] as num?)?.toInt(),
  position: (json['position'] as num).toDouble(),
  progress: (json['progress'] as num).toDouble(),
);

Map<String, dynamic> _$PlayTargetToJson(PlayTarget instance) => <String, dynamic>{
  'action': instance.action,
  'label': instance.label,
  'episode_id': ?instance.episodeId,
  'season_number': ?instance.seasonNumber,
  'position': instance.position,
  'progress': instance.progress,
};
