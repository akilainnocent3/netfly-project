// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'notice.g.dart';

@JsonSerializable()
class Notice {
  const Notice({required this.text, required this.at});

  factory Notice.fromJson(Map<String, Object?> json) => _$NoticeFromJson(json);

  final String text;
  final DateTime at;

  Map<String, Object?> toJson() => _$NoticeToJson(this);
}
