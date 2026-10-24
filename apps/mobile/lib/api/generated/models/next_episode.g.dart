// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'next_episode.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NextEpisode _$NextEpisodeFromJson(Map<String, dynamic> json) => NextEpisode(
  id: (json['id'] as num).toInt(),
  label: json['label'] as String,
  name: json['name'] as String,
  synopsis: json['synopsis'] as String,
  thumbnail: json['thumbnail'] == null ? null : ImageRef.fromJson(json['thumbnail'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NextEpisodeToJson(NextEpisode instance) => <String, dynamic>{
  'id': instance.id,
  'label': instance.label,
  'name': instance.name,
  'synopsis': instance.synopsis,
  'thumbnail': ?instance.thumbnail,
};
