// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'playback.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Playback _$PlaybackFromJson(Map<String, dynamic> json) => Playback(
  sessionId: json['session_id'] as String,
  assetId: json['asset_id'] as String,
  masterUrl: json['master_url'] as String,
  thumbnailsUrl: json['thumbnails_url'] as String,
  duration: (json['duration'] as num).toDouble(),
  startAt: (json['start_at'] as num).toDouble(),
  maxHeight: (json['max_height'] as num?)?.toInt(),
  title: PlaybackTitle.fromJson(json['title'] as Map<String, dynamic>),
  episode: json['episode'] == null ? null : PlaybackEpisode.fromJson(json['episode'] as Map<String, dynamic>),
  next: json['next'] == null ? null : NextEpisode.fromJson(json['next'] as Map<String, dynamic>),
  renditions: (json['renditions'] as List<dynamic>)
      .map((e) => RenditionInfo.fromJson(e as Map<String, dynamic>))
      .toList(),
  subtitles: (json['subtitles'] as List<dynamic>).map((e) => SubtitleInfo.fromJson(e as Map<String, dynamic>)).toList(),
  isPreview: json['is_preview'] as bool,
  metered: json['metered'] as bool,
);

Map<String, dynamic> _$PlaybackToJson(Playback instance) => <String, dynamic>{
  'session_id': instance.sessionId,
  'asset_id': instance.assetId,
  'master_url': instance.masterUrl,
  'thumbnails_url': instance.thumbnailsUrl,
  'duration': instance.duration,
  'start_at': instance.startAt,
  'max_height': ?instance.maxHeight,
  'title': instance.title,
  'episode': ?instance.episode,
  'next': ?instance.next,
  'renditions': instance.renditions,
  'subtitles': instance.subtitles,
  'is_preview': instance.isPreview,
  'metered': instance.metered,
};
