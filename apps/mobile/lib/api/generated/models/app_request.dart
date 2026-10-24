// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'app_enum.dart';

part 'app_request.g.dart';

@JsonSerializable()
class AppRequest {
  const AppRequest({this.app = AppEnum.client});

  factory AppRequest.fromJson(Map<String, Object?> json) => _$AppRequestFromJson(json);

  final AppEnum app;

  Map<String, Object?> toJson() => _$AppRequestToJson(this);
}
