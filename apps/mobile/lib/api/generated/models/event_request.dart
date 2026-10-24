// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'event_kind_enum.dart';

part 'event_request.g.dart';

@JsonSerializable()
class EventRequest {
  const EventRequest({
    required this.sessionId,
    required this.kind,
    this.position = 0.0,
    this.titleId,
    this.episodeId,
    this.value,
    this.data,
    this.ts,
  });

  factory EventRequest.fromJson(Map<String, Object?> json) => _$EventRequestFromJson(json);

  @JsonKey(name: 'session_id')
  final String sessionId;
  final EventKindEnum kind;
  @JsonKey(name: 'title_id')
  final int? titleId;
  @JsonKey(name: 'episode_id')
  final int? episodeId;
  final double position;
  final double? value;
  final Map<String, dynamic>? data;
  final DateTime? ts;

  Map<String, Object?> toJson() => _$EventRequestToJson(this);
}
