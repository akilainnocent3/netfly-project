// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'play_target_action_enum.dart';

part 'play_target.g.dart';

/// What the smart Play button does.
@JsonSerializable()
class PlayTarget {
  const PlayTarget({
    required this.action,
    required this.label,
    required this.episodeId,
    required this.seasonNumber,
    required this.position,
    required this.progress,
  });

  factory PlayTarget.fromJson(Map<String, Object?> json) => _$PlayTargetFromJson(json);

  final PlayTargetActionEnum action;
  final String label;
  @JsonKey(name: 'episode_id')
  final int? episodeId;
  @JsonKey(name: 'season_number')
  final int? seasonNumber;
  final double position;
  final double progress;

  Map<String, Object?> toJson() => _$PlayTargetToJson(this);
}
