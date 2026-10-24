// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'patched_user_request.g.dart';

@JsonSerializable()
class PatchedUserRequest {
  const PatchedUserRequest({
    this.fullName,
    this.translationMode,
    this.preferredQuality,
    this.autoplayNext,
    this.autoplayPreviews,
    this.subtitlesLanguage,
  });

  factory PatchedUserRequest.fromJson(Map<String, Object?> json) => _$PatchedUserRequestFromJson(json);

  @JsonKey(name: 'full_name')
  final String? fullName;
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

  Map<String, Object?> toJson() => _$PatchedUserRequestToJson(this);
}
