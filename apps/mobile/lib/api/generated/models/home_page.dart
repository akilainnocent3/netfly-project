// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'row.dart';

part 'home_page.g.dart';

@JsonSerializable()
class HomePage {
  const HomePage({required this.rows, required this.next});

  factory HomePage.fromJson(Map<String, Object?> json) => _$HomePageFromJson(json);

  final List<Row> rows;
  final String? next;

  Map<String, Object?> toJson() => _$HomePageToJson(this);
}
