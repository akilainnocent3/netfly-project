// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reset_confirm_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResetConfirmRequest _$ResetConfirmRequestFromJson(Map<String, dynamic> json) => ResetConfirmRequest(
  resetToken: json['reset_token'] as String,
  code: json['code'] as String,
  newPassword: json['new_password'] as String,
  app: json['app'] == null ? AppEnum.client : AppEnum.fromJson(json['app'] as String),
);

Map<String, dynamic> _$ResetConfirmRequestToJson(ResetConfirmRequest instance) => <String, dynamic>{
  'reset_token': instance.resetToken,
  'code': instance.code,
  'new_password': instance.newPassword,
  'app': instance.app,
};
