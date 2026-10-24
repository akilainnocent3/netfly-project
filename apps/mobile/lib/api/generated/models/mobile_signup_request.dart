// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mobile_signup_request.g.dart';

@JsonSerializable()
class MobileSignupRequest {
  const MobileSignupRequest({required this.username, required this.fullName, required this.password});

  factory MobileSignupRequest.fromJson(Map<String, Object?> json) => _$MobileSignupRequestFromJson(json);

  final String username;
  @JsonKey(name: 'full_name')
  final String fullName;
  final String password;

  Map<String, Object?> toJson() => _$MobileSignupRequestToJson(this);
}
