// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mobile_login_request.g.dart';

@JsonSerializable()
class MobileLoginRequest {
  const MobileLoginRequest({required this.username, required this.password});

  factory MobileLoginRequest.fromJson(Map<String, Object?> json) => _$MobileLoginRequestFromJson(json);

  final String username;
  final String password;

  Map<String, Object?> toJson() => _$MobileLoginRequestToJson(this);
}
