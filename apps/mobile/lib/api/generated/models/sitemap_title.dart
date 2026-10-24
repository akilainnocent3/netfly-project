// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sitemap_title.g.dart';

@JsonSerializable()
class SitemapTitle {
  const SitemapTitle({required this.slug, required this.type, required this.updatedAt, required this.image});

  factory SitemapTitle.fromJson(Map<String, Object?> json) => _$SitemapTitleFromJson(json);

  final String slug;
  final String type;
  @JsonKey(name: 'updated_at')
  final DateTime updatedAt;
  final String? image;

  Map<String, Object?> toJson() => _$SitemapTitleToJson(this);
}
