// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reset_start_request.g.dart';

@JsonSerializable()
class ResetStartRequest {
  const ResetStartRequest({required this.identifier});

  factory ResetStartRequest.fromJson(Map<String, Object?> json) => _$ResetStartRequestFromJson(json);

  final String identifier;

  Map<String, Object?> toJson() => _$ResetStartRequestToJson(this);
}
