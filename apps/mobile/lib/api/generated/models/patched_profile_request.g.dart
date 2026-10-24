// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patched_profile_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PatchedProfileRequest _$PatchedProfileRequestFromJson(Map<String, dynamic> json) => PatchedProfileRequest(
  name: json['name'] as String?,
  avatarKey: json['avatar_key'] == null ? null : AvatarKeyEnum.fromJson(json['avatar_key'] as String),
  isKids: json['is_kids'] as bool?,
  translationMode: json['translation_mode'] as String?,
);

Map<String, dynamic> _$PatchedProfileRequestToJson(PatchedProfileRequest instance) => <String, dynamic>{
  'name': ?instance.name,
  'avatar_key': ?instance.avatarKey,
  'is_kids': ?instance.isKids,
  'translation_mode': ?instance.translationMode,
};
