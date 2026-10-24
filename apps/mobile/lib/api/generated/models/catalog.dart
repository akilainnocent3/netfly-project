// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'catalog_entry.dart';
import 'catalog_letter.dart';

part 'catalog.g.dart';

@JsonSerializable()
class Catalog {
  const Catalog({
    required this.count,
    required this.page,
    required this.pages,
    required this.pageSize,
    required this.letters,
    required this.results,
  });

  factory Catalog.fromJson(Map<String, Object?> json) => _$CatalogFromJson(json);

  final int count;
  final int page;
  final int pages;
  @JsonKey(name: 'page_size')
  final int pageSize;
  final List<CatalogLetter> letters;
  final List<CatalogEntry> results;

  Map<String, Object?> toJson() => _$CatalogToJson(this);
}
