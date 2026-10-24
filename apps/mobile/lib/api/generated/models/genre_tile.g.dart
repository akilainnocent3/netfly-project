// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'genre_tile.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GenreTile _$GenreTileFromJson(Map<String, dynamic> json) => GenreTile(
  id: (json['id'] as num).toInt(),
  name: json['name'] as String,
  slug: json['slug'] as String,
  artwork: json['artwork'] == null ? null : ImageRef.fromJson(json['artwork'] as Map<String, dynamic>),
  titleCount: (json['title_count'] as num).toInt(),
  sample: json['sample'] == null ? null : ImageRef.fromJson(json['sample'] as Map<String, dynamic>),
  description: json['description'] as String?,
);

Map<String, dynamic> _$GenreTileToJson(GenreTile instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'slug': instance.slug,
  'description': ?instance.description,
  'artwork': ?instance.artwork,
  'title_count': instance.titleCount,
  'sample': ?instance.sample,
};
