// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'playback_episode.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlaybackEpisode _$PlaybackEpisodeFromJson(Map<String, dynamic> json) => PlaybackEpisode(
  id: (json['id'] as num).toInt(),
  number: (json['number'] as num).toInt(),
  name: json['name'] as String,
  seasonNumber: (json['season_number'] as num).toInt(),
  synopsis: json['synopsis'] as String,
  introStart: (json['intro_start'] as num?)?.toDouble(),
  introEnd: (json['intro_end'] as num?)?.toDouble(),
  creditsStart: (json['credits_start'] as num?)?.toDouble(),
);

Map<String, dynamic> _$PlaybackEpisodeToJson(PlaybackEpisode instance) => <String, dynamic>{
  'id': instance.id,
  'number': instance.number,
  'name': instance.name,
  'season_number': instance.seasonNumber,
  'synopsis': instance.synopsis,
  'intro_start': ?instance.introStart,
  'intro_end': ?instance.introEnd,
  'credits_start': ?instance.creditsStart,
};
