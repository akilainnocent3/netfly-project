// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'avatar_key_enum.dart';

part 'profile_request.g.dart';

@JsonSerializable()
class ProfileRequest {
  const ProfileRequest({required this.name, this.avatarKey, this.isKids, this.translationMode});

  factory ProfileRequest.fromJson(Map<String, Object?> json) => _$ProfileRequestFromJson(json);

  final String name;
  @JsonKey(name: 'avatar_key')
  final AvatarKeyEnum? avatarKey;
  @JsonKey(name: 'is_kids')
  final bool? isKids;
  @JsonKey(name: 'translation_mode')
  final String? translationMode;

  Map<String, Object?> toJson() => _$ProfileRequestToJson(this);
}
