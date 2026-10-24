// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'image_ref.dart';

part 'episode.g.dart';

@JsonSerializable()
class Episode {
  const Episode({
    required this.id,
    required this.number,
    required this.name,
    required this.thumbnail,
    required this.progress,
    required this.watched,
    required this.available,
    this.synopsis,
    this.runtimeMinutes,
  });

  factory Episode.fromJson(Map<String, Object?> json) => _$EpisodeFromJson(json);

  final int id;
  final int number;
  final String name;
  final String? synopsis;
  @JsonKey(name: 'runtime_minutes')
  final int? runtimeMinutes;
  final ImageRef? thumbnail;
  final double progress;
  final bool watched;
  final bool available;

  Map<String, Object?> toJson() => _$EpisodeToJson(this);
}
