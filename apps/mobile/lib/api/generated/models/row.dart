// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'title_card.dart';

part 'row.g.dart';

@JsonSerializable()
class Row {
  const Row({required this.key, required this.kind, required this.title, required this.items, this.seed});

  factory Row.fromJson(Map<String, Object?> json) => _$RowFromJson(json);

  final String key;
  final String kind;
  final String title;
  final List<TitleCard> items;
  final String? seed;

  Map<String, Object?> toJson() => _$RowToJson(this);
}
