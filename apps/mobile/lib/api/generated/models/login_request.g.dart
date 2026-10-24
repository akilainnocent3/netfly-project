// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'login_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LoginRequest _$LoginRequestFromJson(Map<String, dynamic> json) => LoginRequest(
  username: json['username'] as String,
  password: json['password'] as String,
  app: json['app'] == null ? AppEnum.client : AppEnum.fromJson(json['app'] as String),
  remember: json['remember'] as bool? ?? true,
);

Map<String, dynamic> _$LoginRequestToJson(LoginRequest instance) => <String, dynamic>{
  'username': instance.username,
  'password': instance.password,
  'app': instance.app,
  'remember': instance.remember,
};
