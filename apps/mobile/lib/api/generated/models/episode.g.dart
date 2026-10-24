// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'episode.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Episode _$EpisodeFromJson(Map<String, dynamic> json) => Episode(
  id: (json['id'] as num).toInt(),
  number: (json['number'] as num).toInt(),
  name: json['name'] as String,
  thumbnail: json['thumbnail'] == null ? null : ImageRef.fromJson(json['thumbnail'] as Map<String, dynamic>),
  progress: (json['progress'] as num).toDouble(),
  watched: json['watched'] as bool,
  available: json['available'] as bool,
  synopsis: json['synopsis'] as String?,
  runtimeMinutes: (json['runtime_minutes'] as num?)?.toInt(),
);

Map<String, dynamic> _$EpisodeToJson(Episode instance) => <String, dynamic>{
  'id': instance.id,
  'number': instance.number,
  'name': instance.name,
  'synopsis': ?instance.synopsis,
  'runtime_minutes': ?instance.runtimeMinutes,
  'thumbnail': ?instance.thumbnail,
  'progress': instance.progress,
  'watched': instance.watched,
  'available': instance.available,
};
