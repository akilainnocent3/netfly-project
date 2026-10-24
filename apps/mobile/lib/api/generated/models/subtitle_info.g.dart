// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subtitle_info.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SubtitleInfo _$SubtitleInfoFromJson(Map<String, dynamic> json) => SubtitleInfo(
  language: json['language'] as String,
  label: json['label'] as String,
  isDefault: json['is_default'] as bool,
);

Map<String, dynamic> _$SubtitleInfoToJson(SubtitleInfo instance) => <String, dynamic>{
  'language': instance.language,
  'label': instance.label,
  'is_default': instance.isDefault,
};
