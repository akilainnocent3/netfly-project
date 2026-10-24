// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sitemap_genre.dart';
import 'sitemap_title.dart';

part 'sitemap.g.dart';

@JsonSerializable()
class Sitemap {
  const Sitemap({required this.titles, required this.genres});

  factory Sitemap.fromJson(Map<String, Object?> json) => _$SitemapFromJson(json);

  final List<SitemapTitle> titles;
  final List<SitemapGenre> genres;

  Map<String, Object?> toJson() => _$SitemapToJson(this);
}
