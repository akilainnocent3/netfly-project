// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'episode.dart';
import 'season_summary.dart';

part 'episode_page.g.dart';

@JsonSerializable()
class EpisodePage {
  const EpisodePage({required this.results, required this.next, required this.season});

  factory EpisodePage.fromJson(Map<String, Object?> json) => _$EpisodePageFromJson(json);

  final List<Episode> results;
  final int? next;
  final SeasonSummary season;

  Map<String, Object?> toJson() => _$EpisodePageToJson(this);
}
