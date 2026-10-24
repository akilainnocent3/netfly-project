// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'usage_windows.g.dart';

@JsonSerializable()
class UsageWindows {
  const UsageWindows({required this.day, required this.week, required this.month});

  factory UsageWindows.fromJson(Map<String, Object?> json) => _$UsageWindowsFromJson(json);

  final int? day;
  final int? week;
  final int? month;

  Map<String, Object?> toJson() => _$UsageWindowsToJson(this);
}
