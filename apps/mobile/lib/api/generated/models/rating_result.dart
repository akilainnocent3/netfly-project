// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rating_result.g.dart';

@JsonSerializable()
class RatingResult {
  const RatingResult({required this.titleId, required this.value});

  factory RatingResult.fromJson(Map<String, Object?> json) => _$RatingResultFromJson(json);

  @JsonKey(name: 'title_id')
  final int titleId;
  final int? value;

  Map<String, Object?> toJson() => _$RatingResultToJson(this);
}
