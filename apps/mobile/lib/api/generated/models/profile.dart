// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'avatar_key_enum.dart';

part 'profile.g.dart';

@JsonSerializable()
class Profile {
  const Profile({
    required this.id,
    required this.name,
    required this.createdAt,
    this.avatarKey,
    this.isKids,
    this.translationMode,
  });

  factory Profile.fromJson(Map<String, Object?> json) => _$ProfileFromJson(json);

  final int id;
  final String name;
  @JsonKey(name: 'avatar_key')
  final AvatarKeyEnum? avatarKey;
  @JsonKey(name: 'is_kids')
  final bool? isKids;
  @JsonKey(name: 'translation_mode')
  final String? translationMode;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$ProfileToJson(this);
}
