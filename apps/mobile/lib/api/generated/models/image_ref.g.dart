// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'image_ref.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ImageRef _$ImageRefFromJson(Map<String, dynamic> json) => ImageRef(
  key: json['key'] as String,
  blur: json['blur'] as String,
  color: json['color'] as String,
  width: (json['width'] as num?)?.toInt(),
  height: (json['height'] as num?)?.toInt(),
);

Map<String, dynamic> _$ImageRefToJson(ImageRef instance) => <String, dynamic>{
  'key': instance.key,
  'blur': instance.blur,
  'color': instance.color,
  'width': ?instance.width,
  'height': ?instance.height,
};
