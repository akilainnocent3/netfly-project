// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'catalog_letter.g.dart';

@JsonSerializable()
class CatalogLetter {
  const CatalogLetter({required this.letter, required this.page});

  factory CatalogLetter.fromJson(Map<String, Object?> json) => _$CatalogLetterFromJson(json);

  final String letter;
  final int page;

  Map<String, Object?> toJson() => _$CatalogLetterToJson(this);
}
