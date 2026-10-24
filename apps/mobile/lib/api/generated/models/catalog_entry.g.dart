// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'catalog_entry.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CatalogEntry _$CatalogEntryFromJson(Map<String, dynamic> json) => CatalogEntry(
  slug: json['slug'] as String,
  title: json['title'] as String,
  type: json['type'] as String,
  year: (json['year'] as num?)?.toInt(),
  letter: json['letter'] as String,
);

Map<String, dynamic> _$CatalogEntryToJson(CatalogEntry instance) => <String, dynamic>{
  'slug': instance.slug,
  'title': instance.title,
  'type': instance.type,
  'year': ?instance.year,
  'letter': instance.letter,
};
