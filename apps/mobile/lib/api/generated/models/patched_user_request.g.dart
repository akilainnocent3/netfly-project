// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'patched_user_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PatchedUserRequest _$PatchedUserRequestFromJson(Map<String, dynamic> json) => PatchedUserRequest(
  fullName: json['full_name'] as String?,
  translationMode: json['translation_mode'] as String?,
  preferredQuality: json['preferred_quality'] as String?,
  autoplayNext: json['autoplay_next'] as bool?,
  autoplayPreviews: json['autoplay_previews'] as bool?,
  subtitlesLanguage: json['subtitles_language'] as String?,
);

Map<String, dynamic> _$PatchedUserRequestToJson(PatchedUserRequest instance) => <String, dynamic>{
  'full_name': ?instance.fullName,
  'translation_mode': ?instance.translationMode,
  'preferred_quality': ?instance.preferredQuality,
  'autoplay_next': ?instance.autoplayNext,
  'autoplay_previews': ?instance.autoplayPreviews,
  'subtitles_language': ?instance.subtitlesLanguage,
};
