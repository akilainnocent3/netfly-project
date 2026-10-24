// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'genre_header.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GenreHeader _$GenreHeaderFromJson(Map<String, dynamic> json) => GenreHeader(
  id: (json['id'] as num).toInt(),
  name: json['name'] as String,
  slug: json['slug'] as String,
  artwork: json['artwork'] == null ? null : ImageRef.fromJson(json['artwork'] as Map<String, dynamic>),
  sample: json['sample'] == null ? null : ImageRef.fromJson(json['sample'] as Map<String, dynamic>),
  description: json['description'] as String?,
);

Map<String, dynamic> _$GenreHeaderToJson(GenreHeader instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'slug': instance.slug,
  'description': ?instance.description,
  'artwork': ?instance.artwork,
  'sample': ?instance.sample,
};
