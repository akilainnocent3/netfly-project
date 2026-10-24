// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sitemap_genre.g.dart';

@JsonSerializable()
class SitemapGenre {
  const SitemapGenre({required this.slug, required this.updatedAt});

  factory SitemapGenre.fromJson(Map<String, Object?> json) => _$SitemapGenreFromJson(json);

  final String slug;
  @JsonKey(name: 'updated_at')
  final DateTime? updatedAt;

  Map<String, Object?> toJson() => _$SitemapGenreToJson(this);
}
