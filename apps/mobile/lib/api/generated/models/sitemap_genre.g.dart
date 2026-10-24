// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sitemap_genre.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SitemapGenre _$SitemapGenreFromJson(Map<String, dynamic> json) => SitemapGenre(
  slug: json['slug'] as String,
  updatedAt: json['updated_at'] == null ? null : DateTime.parse(json['updated_at'] as String),
);

Map<String, dynamic> _$SitemapGenreToJson(SitemapGenre instance) => <String, dynamic>{
  'slug': instance.slug,
  'updated_at': ?instance.updatedAt?.toIso8601String(),
};
