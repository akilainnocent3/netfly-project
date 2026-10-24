// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'username_availability.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UsernameAvailability _$UsernameAvailabilityFromJson(Map<String, dynamic> json) => UsernameAvailability(
  username: json['username'] as String,
  available: json['available'] as bool,
  message: json['message'] as String,
);

Map<String, dynamic> _$UsernameAvailabilityToJson(UsernameAvailability instance) => <String, dynamic>{
  'username': instance.username,
  'available': instance.available,
  'message': instance.message,
};
