// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'usage_plan.g.dart';

@JsonSerializable()
class UsagePlan {
  const UsagePlan({required this.slug, required this.name, required this.isFree});

  factory UsagePlan.fromJson(Map<String, Object?> json) => _$UsagePlanFromJson(json);

  final String slug;
  final String name;
  @JsonKey(name: 'is_free')
  final bool isFree;

  Map<String, Object?> toJson() => _$UsagePlanToJson(this);
}
