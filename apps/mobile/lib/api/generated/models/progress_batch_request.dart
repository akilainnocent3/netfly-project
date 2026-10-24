// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'progress_update_request.dart';

part 'progress_batch_request.g.dart';

@JsonSerializable()
class ProgressBatchRequest {
  const ProgressBatchRequest({required this.updates});

  factory ProgressBatchRequest.fromJson(Map<String, Object?> json) => _$ProgressBatchRequestFromJson(json);

  final List<ProgressUpdateRequest> updates;

  Map<String, Object?> toJson() => _$ProgressBatchRequestToJson(this);
}
