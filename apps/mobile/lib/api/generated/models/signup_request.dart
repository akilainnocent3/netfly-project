// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'app_enum.dart';

part 'signup_request.g.dart';

@JsonSerializable()
class SignupRequest {
  const SignupRequest({
    required this.username,
    required this.fullName,
    required this.password,
    this.app = AppEnum.client,
  });

  factory SignupRequest.fromJson(Map<String, Object?> json) => _$SignupRequestFromJson(json);

  final String username;
  @JsonKey(name: 'full_name')
  final String fullName;
  final String password;
  final AppEnum app;

  Map<String, Object?> toJson() => _$SignupRequestToJson(this);
}
