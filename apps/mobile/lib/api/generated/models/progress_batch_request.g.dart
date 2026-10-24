// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'progress_batch_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProgressBatchRequest _$ProgressBatchRequestFromJson(Map<String, dynamic> json) => ProgressBatchRequest(
  updates: (json['updates'] as List<dynamic>)
      .map((e) => ProgressUpdateRequest.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ProgressBatchRequestToJson(ProgressBatchRequest instance) => <String, dynamic>{
  'updates': instance.updates,
};
