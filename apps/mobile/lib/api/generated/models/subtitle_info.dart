// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'subtitle_info.g.dart';

@JsonSerializable()
class SubtitleInfo {
  const SubtitleInfo({required this.language, required this.label, required this.isDefault});

  factory SubtitleInfo.fromJson(Map<String, Object?> json) => _$SubtitleInfoFromJson(json);

  final String language;
  final String label;
  @JsonKey(name: 'is_default')
  final bool isDefault;

  Map<String, Object?> toJson() => _$SubtitleInfoToJson(this);
}
