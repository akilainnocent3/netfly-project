// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'playback_episode.g.dart';

@JsonSerializable()
class PlaybackEpisode {
  const PlaybackEpisode({
    required this.id,
    required this.number,
    required this.name,
    required this.seasonNumber,
    required this.synopsis,
    required this.introStart,
    required this.introEnd,
    required this.creditsStart,
  });

  factory PlaybackEpisode.fromJson(Map<String, Object?> json) => _$PlaybackEpisodeFromJson(json);

  final int id;
  final int number;
  final String name;
  @JsonKey(name: 'season_number')
  final int seasonNumber;
  final String synopsis;
  @JsonKey(name: 'intro_start')
  final double? introStart;
  @JsonKey(name: 'intro_end')
  final double? introEnd;
  @JsonKey(name: 'credits_start')
  final double? creditsStart;

  Map<String, Object?> toJson() => _$PlaybackEpisodeToJson(this);
}
