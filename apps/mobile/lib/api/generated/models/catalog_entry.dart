// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'catalog_entry.g.dart';

@JsonSerializable()
class CatalogEntry {
  const CatalogEntry({
    required this.slug,
    required this.title,
    required this.type,
    required this.year,
    required this.letter,
  });

  factory CatalogEntry.fromJson(Map<String, Object?> json) => _$CatalogEntryFromJson(json);

  final String slug;
  final String title;
  final String type;
  final int? year;
  final String letter;

  Map<String, Object?> toJson() => _$CatalogEntryToJson(this);
}
