// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mobile_refresh_request.g.dart';

@JsonSerializable()
class MobileRefreshRequest {
  const MobileRefreshRequest({required this.refresh});

  factory MobileRefreshRequest.fromJson(Map<String, Object?> json) => _$MobileRefreshRequestFromJson(json);

  final String refresh;

  Map<String, Object?> toJson() => _$MobileRefreshRequestToJson(this);
}
