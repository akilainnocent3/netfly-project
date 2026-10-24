// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'image_ref.dart';

part 'genre_header.g.dart';

/// The category page header (no count: the grid pages through the titles).
@JsonSerializable()
class GenreHeader {
  const GenreHeader({
    required this.id,
    required this.name,
    required this.slug,
    required this.artwork,
    required this.sample,
    this.description,
  });

  factory GenreHeader.fromJson(Map<String, Object?> json) => _$GenreHeaderFromJson(json);

  final int id;
  final String name;
  final String slug;
  final String? description;
  final ImageRef? artwork;
  final ImageRef? sample;

  Map<String, Object?> toJson() => _$GenreHeaderToJson(this);
}
