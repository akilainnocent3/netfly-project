// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rendition_info.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RenditionInfo _$RenditionInfoFromJson(Map<String, dynamic> json) => RenditionInfo(
  height: (json['height'] as num).toInt(),
  width: (json['width'] as num).toInt(),
  bandwidth: (json['bandwidth'] as num).toInt(),
);

Map<String, dynamic> _$RenditionInfoToJson(RenditionInfo instance) => <String, dynamic>{
  'height': instance.height,
  'width': instance.width,
  'bandwidth': instance.bandwidth,
};
