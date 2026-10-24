// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'app_enum.dart';

part 'reset_confirm_request.g.dart';

@JsonSerializable()
class ResetConfirmRequest {
  const ResetConfirmRequest({
    required this.resetToken,
    required this.code,
    required this.newPassword,
    this.app = AppEnum.client,
  });

  factory ResetConfirmRequest.fromJson(Map<String, Object?> json) => _$ResetConfirmRequestFromJson(json);

  @JsonKey(name: 'reset_token')
  final String resetToken;
  final String code;
  @JsonKey(name: 'new_password')
  final String newPassword;
  final AppEnum app;

  Map<String, Object?> toJson() => _$ResetConfirmRequestToJson(this);
}
