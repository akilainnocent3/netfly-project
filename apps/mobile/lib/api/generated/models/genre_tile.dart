// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'image_ref.dart';

part 'genre_tile.g.dart';

/// `artwork` is the editor's image once it has rendered; `sample` is a backdrop from one of.
/// the genre's titles whenever the artwork is missing, still rendering or failed.
@JsonSerializable()
class GenreTile {
  const GenreTile({
    required this.id,
    required this.name,
    required this.slug,
    required this.artwork,
    required this.titleCount,
    required this.sample,
    this.description,
  });

  factory GenreTile.fromJson(Map<String, Object?> json) => _$GenreTileFromJson(json);

  final int id;
  final String name;
  final String slug;
  final String? description;
  final ImageRef? artwork;
  @JsonKey(name: 'title_count')
  final int titleCount;
  final ImageRef? sample;

  Map<String, Object?> toJson() => _$GenreTileToJson(this);
}
