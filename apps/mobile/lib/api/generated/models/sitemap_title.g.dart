// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sitemap_title.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SitemapTitle _$SitemapTitleFromJson(Map<String, dynamic> json) => SitemapTitle(
  slug: json['slug'] as String,
  type: json['type'] as String,
  updatedAt: DateTime.parse(json['updated_at'] as String),
  image: json['image'] as String?,
);

Map<String, dynamic> _$SitemapTitleToJson(SitemapTitle instance) => <String, dynamic>{
  'slug': instance.slug,
  'type': instance.type,
  'updated_at': instance.updatedAt.toIso8601String(),
  'image': ?instance.image,
};
