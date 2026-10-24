// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Session _$SessionFromJson(Map<String, dynamic> json) => Session(
  access: json['access'] as String,
  expiresIn: (json['expires_in'] as num).toInt(),
  csrf: json['csrf'] as String,
  user: User.fromJson(json['user'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SessionToJson(Session instance) => <String, dynamic>{
  'access': instance.access,
  'expires_in': instance.expiresIn,
  'csrf': instance.csrf,
  'user': instance.user,
};
