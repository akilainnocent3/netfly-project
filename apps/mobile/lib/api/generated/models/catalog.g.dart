// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'catalog.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Catalog _$CatalogFromJson(Map<String, dynamic> json) => Catalog(
  count: (json['count'] as num).toInt(),
  page: (json['page'] as num).toInt(),
  pages: (json['pages'] as num).toInt(),
  pageSize: (json['page_size'] as num).toInt(),
  letters: (json['letters'] as List<dynamic>).map((e) => CatalogLetter.fromJson(e as Map<String, dynamic>)).toList(),
  results: (json['results'] as List<dynamic>).map((e) => CatalogEntry.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$CatalogToJson(Catalog instance) => <String, dynamic>{
  'count': instance.count,
  'page': instance.page,
  'pages': instance.pages,
  'page_size': instance.pageSize,
  'letters': instance.letters,
  'results': instance.results,
};
