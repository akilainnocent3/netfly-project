// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'card_context.g.dart';

/// Row-specific extras (Continue Watching progress, Top 10 rank…).
@JsonSerializable()
class CardContext {
  const CardContext({this.progress, this.label, this.episodeId, this.rank, this.otherMode});

  factory CardContext.fromJson(Map<String, Object?> json) => _$CardContextFromJson(json);

  final double? progress;
  final String? label;
  @JsonKey(name: 'episode_id')
  final int? episodeId;
  final int? rank;
  @JsonKey(name: 'other_mode')
  final bool? otherMode;

  Map<String, Object?> toJson() => _$CardContextToJson(this);
}
