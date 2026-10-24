// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'genre_page.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GenrePage _$GenrePageFromJson(Map<String, dynamic> json) => GenrePage(
  rows: (json['rows'] as List<dynamic>).map((e) => Row.fromJson(e as Map<String, dynamic>)).toList(),
  next: json['next'] as String?,
  genre: GenreHeader.fromJson(json['genre'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GenrePageToJson(GenrePage instance) => <String, dynamic>{
  'rows': instance.rows,
  'next': ?instance.next,
  'genre': instance.genre,
};
