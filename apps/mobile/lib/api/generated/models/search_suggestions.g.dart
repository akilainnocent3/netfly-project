// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_suggestions.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchSuggestions _$SearchSuggestionsFromJson(Map<String, dynamic> json) => SearchSuggestions(
  top: (json['top'] as List<dynamic>).map((e) => e as String).toList(),
  recent: (json['recent'] as List<dynamic>).map((e) => e as String).toList(),
  topTitles: (json['top_titles'] as List<dynamic>).map((e) => TitleCard.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$SearchSuggestionsToJson(SearchSuggestions instance) => <String, dynamic>{
  'top': instance.top,
  'recent': instance.recent,
  'top_titles': instance.topTitles,
};
