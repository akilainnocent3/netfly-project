// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'image_ref.dart';

part 'next_episode.g.dart';

@JsonSerializable()
class NextEpisode {
  const NextEpisode({
    required this.id,
    required this.label,
    required this.name,
    required this.synopsis,
    required this.thumbnail,
  });

  factory NextEpisode.fromJson(Map<String, Object?> json) => _$NextEpisodeFromJson(json);

  final int id;
  final String label;
  final String name;
  final String synopsis;
  final ImageRef? thumbnail;

  Map<String, Object?> toJson() => _$NextEpisodeToJson(this);
}
