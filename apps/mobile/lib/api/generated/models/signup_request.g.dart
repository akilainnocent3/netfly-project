// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'signup_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignupRequest _$SignupRequestFromJson(Map<String, dynamic> json) => SignupRequest(
  username: json['username'] as String,
  fullName: json['full_name'] as String,
  password: json['password'] as String,
  app: json['app'] == null ? AppEnum.client : AppEnum.fromJson(json['app'] as String),
);

Map<String, dynamic> _$SignupRequestToJson(SignupRequest instance) => <String, dynamic>{
  'username': instance.username,
  'full_name': instance.fullName,
  'password': instance.password,
  'app': instance.app,
};
