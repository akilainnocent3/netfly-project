// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'event_batch_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EventBatchRequest _$EventBatchRequestFromJson(Map<String, dynamic> json) => EventBatchRequest(
  events: (json['events'] as List<dynamic>).map((e) => EventRequest.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$EventBatchRequestToJson(EventBatchRequest instance) => <String, dynamic>{
  'events': instance.events,
};
