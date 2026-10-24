// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'season_summary.g.dart';

@JsonSerializable()
class SeasonSummary {
  const SeasonSummary({
    required this.id,
    required this.number,
    required this.displayName,
    required this.episodeCount,
    this.name,
  });

  factory SeasonSummary.fromJson(Map<String, Object?> json) => _$SeasonSummaryFromJson(json);

  final int id;
  final int number;
  final String? name;
  @JsonKey(name: 'display_name')
  final String displayName;
  @JsonKey(name: 'episode_count')
  final int episodeCount;

  Map<String, Object?> toJson() => _$SeasonSummaryToJson(this);
}
