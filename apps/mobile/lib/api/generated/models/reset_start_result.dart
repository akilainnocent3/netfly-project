// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reset_start_result.g.dart';

@JsonSerializable()
class ResetStartResult {
  const ResetStartResult({required this.resetToken, required this.message});

  factory ResetStartResult.fromJson(Map<String, Object?> json) => _$ResetStartResultFromJson(json);

  @JsonKey(name: 'reset_token')
  final String resetToken;
  final String message;

  Map<String, Object?> toJson() => _$ResetStartResultToJson(this);
}
