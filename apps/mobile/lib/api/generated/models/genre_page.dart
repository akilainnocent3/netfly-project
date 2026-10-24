// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'genre_header.dart';
import 'row.dart';

part 'genre_page.g.dart';

@JsonSerializable()
class GenrePage {
  const GenrePage({required this.rows, required this.next, required this.genre});

  factory GenrePage.fromJson(Map<String, Object?> json) => _$GenrePageFromJson(json);

  final List<Row> rows;
  final String? next;
  final GenreHeader genre;

  Map<String, Object?> toJson() => _$GenrePageToJson(this);
}
