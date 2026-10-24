// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mobile_session.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MobileSession _$MobileSessionFromJson(Map<String, dynamic> json) => MobileSession(
  access: json['access'] as String,
  expiresIn: (json['expires_in'] as num).toInt(),
  refresh: json['refresh'] as String,
  user: User.fromJson(json['user'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MobileSessionToJson(MobileSession instance) => <String, dynamic>{
  'access': instance.access,
  'expires_in': instance.expiresIn,
  'refresh': instance.refresh,
  'user': instance.user,
};
