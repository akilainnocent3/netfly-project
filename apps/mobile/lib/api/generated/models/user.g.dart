// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

User _$UserFromJson(Map<String, dynamic> json) => User(
  id: (json['id'] as num).toInt(),
  username: json['username'] as String,
  fullName: json['full_name'] as String,
  isStaff: json['is_staff'] as bool,
  role: RoleEnum.fromJson(json['role'] as String),
  createdAt: DateTime.parse(json['created_at'] as String),
  email: json['email'] as String?,
  emailVerified: json['email_verified'] as bool,
  phone: json['phone'] as String?,
  phoneVerified: json['phone_verified'] as bool,
  translationMode: json['translation_mode'] as String?,
  preferredQuality: json['preferred_quality'] as String?,
  autoplayNext: json['autoplay_next'] as bool?,
  autoplayPreviews: json['autoplay_previews'] as bool?,
  subtitlesLanguage: json['subtitles_language'] as String?,
);

Map<String, dynamic> _$UserToJson(User instance) => <String, dynamic>{
  'id': instance.id,
  'username': instance.username,
  'full_name': instance.fullName,
  'is_staff': instance.isStaff,
  'role': instance.role,
  'created_at': instance.createdAt.toIso8601String(),
  'translation_mode': ?instance.translationMode,
  'preferred_quality': ?instance.preferredQuality,
  'autoplay_next': ?instance.autoplayNext,
  'autoplay_previews': ?instance.autoplayPreviews,
  'subtitles_language': ?instance.subtitlesLanguage,
  'email': ?instance.email,
  'email_verified': instance.emailVerified,
  'phone': ?instance.phone,
  'phone_verified': instance.phoneVerified,
};
