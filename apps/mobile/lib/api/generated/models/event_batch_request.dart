// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'event_request.dart';

part 'event_batch_request.g.dart';

@JsonSerializable()
class EventBatchRequest {
  const EventBatchRequest({required this.events});

  factory EventBatchRequest.fromJson(Map<String, Object?> json) => _$EventBatchRequestFromJson(json);

  final List<EventRequest> events;

  Map<String, Object?> toJson() => _$EventBatchRequestToJson(this);
}
