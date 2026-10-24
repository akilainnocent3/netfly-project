// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'heartbeat_request_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HeartbeatRequestRequest _$HeartbeatRequestRequestFromJson(Map<String, dynamic> json) => HeartbeatRequestRequest(
  sessionId: json['session_id'] as String,
  watched: (json['watched'] as num?)?.toDouble() ?? 0.0,
  playing: json['playing'] as bool? ?? true,
);

Map<String, dynamic> _$HeartbeatRequestRequestToJson(HeartbeatRequestRequest instance) => <String, dynamic>{
  'session_id': instance.sessionId,
  'watched': instance.watched,
  'playing': instance.playing,
};
