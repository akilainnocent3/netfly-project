// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'start_request.g.dart';

@JsonSerializable()
class StartRequest {
  const StartRequest({required this.value});

  factory StartRequest.fromJson(Map<String, Object?> json) => _$StartRequestFromJson(json);

  final String value;

  Map<String, Object?> toJson() => _$StartRequestToJson(this);
}
