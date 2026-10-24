// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'role_enum.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  const User({
    required this.id,
    required this.username,
    required this.fullName,
    required this.isStaff,
    required this.role,
    required this.createdAt,
    required this.email,
    required this.emailVerified,
    required this.phone,
    required this.phoneVerified,
    this.translationMode,
    this.preferredQuality,
    this.autoplayNext,
    this.autoplayPreviews,
    this.subtitlesLanguage,
  });

  factory User.fromJson(Map<String, Object?> json) => _$UserFromJson(json);

  final int id;
  final String username;
  @JsonKey(name: 'full_name')
  final String fullName;
  @JsonKey(name: 'is_staff')
  final bool isStaff;
  final RoleEnum role;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;
  @JsonKey(name: 'translation_mode')
  final String? translationMode;
  @JsonKey(name: 'preferred_quality')
  final String? preferredQuality;
  @JsonKey(name: 'autoplay_next')
  final bool? autoplayNext;
  @JsonKey(name: 'autoplay_previews')
  final bool? autoplayPreviews;
  @JsonKey(name: 'subtitles_language')
  final String? subtitlesLanguage;
  final String? email;
  @JsonKey(name: 'email_verified')
  final bool emailVerified;
  final String? phone;
  @JsonKey(name: 'phone_verified')
  final bool phoneVerified;

  Map<String, Object?> toJson() => _$UserToJson(this);
}
