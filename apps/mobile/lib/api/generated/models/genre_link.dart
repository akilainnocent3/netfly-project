// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'genre_link.g.dart';

@JsonSerializable()
class GenreLink {
  const GenreLink({required this.name, required this.slug});

  factory GenreLink.fromJson(Map<String, Object?> json) => _$GenreLinkFromJson(json);

  final String name;
  final String slug;

  Map<String, Object?> toJson() => _$GenreLinkToJson(this);
}
