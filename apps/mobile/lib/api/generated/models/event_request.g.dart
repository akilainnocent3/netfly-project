// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'event_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EventRequest _$EventRequestFromJson(Map<String, dynamic> json) => EventRequest(
  sessionId: json['session_id'] as String,
  kind: EventKindEnum.fromJson(json['kind'] as String),
  position: (json['position'] as num?)?.toDouble() ?? 0.0,
  titleId: (json['title_id'] as num?)?.toInt(),
  episodeId: (json['episode_id'] as num?)?.toInt(),
  value: (json['value'] as num?)?.toDouble(),
  data: json['data'] as Map<String, dynamic>?,
  ts: json['ts'] == null ? null : DateTime.parse(json['ts'] as String),
);

Map<String, dynamic> _$EventRequestToJson(EventRequest instance) => <String, dynamic>{
  'session_id': instance.sessionId,
  'kind': instance.kind,
  'title_id': ?instance.titleId,
  'episode_id': ?instance.episodeId,
  'position': instance.position,
  'value': ?instance.value,
  'data': ?instance.data,
  'ts': ?instance.ts?.toIso8601String(),
};
