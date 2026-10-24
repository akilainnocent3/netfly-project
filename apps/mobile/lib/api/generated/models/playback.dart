// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'next_episode.dart';
import 'playback_episode.dart';
import 'playback_title.dart';
import 'rendition_info.dart';
import 'subtitle_info.dart';

part 'playback.g.dart';

@JsonSerializable()
class Playback {
  const Playback({
    required this.sessionId,
    required this.assetId,
    required this.masterUrl,
    required this.thumbnailsUrl,
    required this.duration,
    required this.startAt,
    required this.maxHeight,
    required this.title,
    required this.episode,
    required this.next,
    required this.renditions,
    required this.subtitles,
    required this.isPreview,
    required this.metered,
  });

  factory Playback.fromJson(Map<String, Object?> json) => _$PlaybackFromJson(json);

  @JsonKey(name: 'session_id')
  final String sessionId;
  @JsonKey(name: 'asset_id')
  final String assetId;
  @JsonKey(name: 'master_url')
  final String masterUrl;
  @JsonKey(name: 'thumbnails_url')
  final String thumbnailsUrl;
  final double duration;
  @JsonKey(name: 'start_at')
  final double startAt;
  @JsonKey(name: 'max_height')
  final int? maxHeight;
  final PlaybackTitle title;
  final PlaybackEpisode? episode;
  final NextEpisode? next;
  final List<RenditionInfo> renditions;
  final List<SubtitleInfo> subtitles;
  @JsonKey(name: 'is_preview')
  final bool isPreview;
  final bool metered;

  Map<String, Object?> toJson() => _$PlaybackToJson(this);
}
