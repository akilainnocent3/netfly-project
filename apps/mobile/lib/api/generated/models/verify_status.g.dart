// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verify_status.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerifyStatus _$VerifyStatusFromJson(Map<String, dynamic> json) => VerifyStatus(
  email: Contact.fromJson(json['email'] as Map<String, dynamic>),
  phone: Contact.fromJson(json['phone'] as Map<String, dynamic>),
);

Map<String, dynamic> _$VerifyStatusToJson(VerifyStatus instance) => <String, dynamic>{
  'email': instance.email,
  'phone': instance.phone,
};
