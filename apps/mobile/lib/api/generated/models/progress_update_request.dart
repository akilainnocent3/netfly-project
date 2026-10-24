// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'progress_update_request.g.dart';

@JsonSerializable()
class ProgressUpdateRequest {
  const ProgressUpdateRequest({
    required this.titleId,
    required this.position,
    required this.duration,
    this.watched = 0.0,
    this.episodeId,
  });

  factory ProgressUpdateRequest.fromJson(Map<String, Object?> json) => _$ProgressUpdateRequestFromJson(json);

  @JsonKey(name: 'title_id')
  final int titleId;
  @JsonKey(name: 'episode_id')
  final int? episodeId;
  final double position;
  final double duration;

  /// Seconds watched since the last update.
  final double watched;

  Map<String, Object?> toJson() => _$ProgressUpdateRequestToJson(this);
}
