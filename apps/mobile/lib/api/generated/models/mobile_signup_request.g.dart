// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mobile_signup_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MobileSignupRequest _$MobileSignupRequestFromJson(Map<String, dynamic> json) => MobileSignupRequest(
  username: json['username'] as String,
  fullName: json['full_name'] as String,
  password: json['password'] as String,
);

Map<String, dynamic> _$MobileSignupRequestToJson(MobileSignupRequest instance) => <String, dynamic>{
  'username': instance.username,
  'full_name': instance.fullName,
  'password': instance.password,
};
