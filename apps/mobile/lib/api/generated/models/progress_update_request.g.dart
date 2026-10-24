// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'progress_update_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProgressUpdateRequest _$ProgressUpdateRequestFromJson(Map<String, dynamic> json) => ProgressUpdateRequest(
  titleId: (json['title_id'] as num).toInt(),
  position: (json['position'] as num).toDouble(),
  duration: (json['duration'] as num).toDouble(),
  watched: (json['watched'] as num?)?.toDouble() ?? 0.0,
  episodeId: (json['episode_id'] as num?)?.toInt(),
);

Map<String, dynamic> _$ProgressUpdateRequestToJson(ProgressUpdateRequest instance) => <String, dynamic>{
  'title_id': instance.titleId,
  'episode_id': ?instance.episodeId,
  'position': instance.position,
  'duration': instance.duration,
  'watched': instance.watched,
};
