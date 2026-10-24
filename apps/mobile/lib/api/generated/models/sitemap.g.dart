// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sitemap.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Sitemap _$SitemapFromJson(Map<String, dynamic> json) => Sitemap(
  titles: (json['titles'] as List<dynamic>).map((e) => SitemapTitle.fromJson(e as Map<String, dynamic>)).toList(),
  genres: (json['genres'] as List<dynamic>).map((e) => SitemapGenre.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$SitemapToJson(Sitemap instance) => <String, dynamic>{
  'titles': instance.titles,
  'genres': instance.genres,
};
