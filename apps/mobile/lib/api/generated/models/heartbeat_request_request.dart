// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'heartbeat_request_request.g.dart';

@JsonSerializable()
class HeartbeatRequestRequest {
  const HeartbeatRequestRequest({required this.sessionId, this.watched = 0.0, this.playing = true});

  factory HeartbeatRequestRequest.fromJson(Map<String, Object?> json) => _$HeartbeatRequestRequestFromJson(json);

  @JsonKey(name: 'session_id')
  final String sessionId;
  final double watched;
  final bool playing;

  Map<String, Object?> toJson() => _$HeartbeatRequestRequestToJson(this);
}
