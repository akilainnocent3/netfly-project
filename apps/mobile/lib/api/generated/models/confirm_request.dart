// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'confirm_request.g.dart';

@JsonSerializable()
class ConfirmRequest {
  const ConfirmRequest({required this.code});

  factory ConfirmRequest.fromJson(Map<String, Object?> json) => _$ConfirmRequestFromJson(json);

  final String code;

  Map<String, Object?> toJson() => _$ConfirmRequestToJson(this);
}
