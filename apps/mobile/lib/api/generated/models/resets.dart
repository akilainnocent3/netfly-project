// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'resets.g.dart';

@JsonSerializable()
class Resets {
  const Resets({required this.day, required this.week, required this.month});

  factory Resets.fromJson(Map<String, Object?> json) => _$ResetsFromJson(json);

  final DateTime day;
  final DateTime week;
  final DateTime month;

  Map<String, Object?> toJson() => _$ResetsToJson(this);
}
