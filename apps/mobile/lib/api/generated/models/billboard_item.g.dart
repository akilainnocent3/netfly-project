// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'billboard_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BillboardItem _$BillboardItemFromJson(Map<String, dynamic> json) => BillboardItem(
  id: (json['id'] as num).toInt(),
  headline: json['headline'] as String,
  tagline: json['tagline'] as String,
  useTrailer: json['use_trailer'] as bool,
  title: TitleCard.fromJson(json['title'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BillboardItemToJson(BillboardItem instance) => <String, dynamic>{
  'id': instance.id,
  'headline': instance.headline,
  'tagline': instance.tagline,
  'use_trailer': instance.useTrailer,
  'title': instance.title,
};
