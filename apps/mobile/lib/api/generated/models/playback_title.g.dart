// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'playback_title.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlaybackTitle _$PlaybackTitleFromJson(Map<String, dynamic> json) => PlaybackTitle(
  id: (json['id'] as num).toInt(),
  slug: json['slug'] as String,
  title: json['title'] as String,
  type: json['type'] as String,
  maturityRating: json['maturity_rating'] as String,
  logo: json['logo'] == null ? null : ImageRef.fromJson(json['logo'] as Map<String, dynamic>),
  backdrop: json['backdrop'] == null ? null : ImageRef.fromJson(json['backdrop'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PlaybackTitleToJson(PlaybackTitle instance) => <String, dynamic>{
  'id': instance.id,
  'slug': instance.slug,
  'title': instance.title,
  'type': instance.type,
  'maturity_rating': instance.maturityRating,
  'logo': ?instance.logo,
  'backdrop': ?instance.backdrop,
};
