// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Contact _$ContactFromJson(Map<String, dynamic> json) => Contact(
  value: json['value'] as String?,
  verified: json['verified'] as bool,
  pending: json['pending'] == null ? null : CodeSent.fromJson(json['pending'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ContactToJson(Contact instance) => <String, dynamic>{
  'value': ?instance.value,
  'verified': instance.verified,
  'pending': ?instance.pending,
};
