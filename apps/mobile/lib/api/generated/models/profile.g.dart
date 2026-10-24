// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'profile.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Profile _$ProfileFromJson(Map<String, dynamic> json) => Profile(
  id: (json['id'] as num).toInt(),
  name: json['name'] as String,
  createdAt: DateTime.parse(json['created_at'] as String),
  avatarKey: json['avatar_key'] == null ? null : AvatarKeyEnum.fromJson(json['avatar_key'] as String),
  isKids: json['is_kids'] as bool?,
  translationMode: json['translation_mode'] as String?,
);

Map<String, dynamic> _$ProfileToJson(Profile instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'avatar_key': ?instance.avatarKey,
  'is_kids': ?instance.isKids,
  'translation_mode': ?instance.translationMode,
  'created_at': instance.createdAt.toIso8601String(),
};
