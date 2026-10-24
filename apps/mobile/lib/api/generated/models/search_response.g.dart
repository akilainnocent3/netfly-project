// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_response.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchResponse _$SearchResponseFromJson(Map<String, dynamic> json) => SearchResponse(
  results: (json['results'] as List<dynamic>).map((e) => TitleCard.fromJson(e as Map<String, dynamic>)).toList(),
  related: (json['related'] as List<dynamic>).map((e) => RelatedTerm.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$SearchResponseToJson(SearchResponse instance) => <String, dynamic>{
  'results': instance.results,
  'related': instance.related,
};
