// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'landing.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Landing _$LandingFromJson(Map<String, dynamic> json) => Landing(
  trending: (json['trending'] as List<dynamic>).map((e) => TitleCard.fromJson(e as Map<String, dynamic>)).toList(),
  genres: (json['genres'] as List<dynamic>).map((e) => GenreLink.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$LandingToJson(Landing instance) => <String, dynamic>{
  'trending': instance.trending,
  'genres': instance.genres,
};
