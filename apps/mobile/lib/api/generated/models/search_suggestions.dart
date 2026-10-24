// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'title_card.dart';

part 'search_suggestions.g.dart';

@JsonSerializable()
class SearchSuggestions {
  const SearchSuggestions({required this.top, required this.recent, required this.topTitles});

  factory SearchSuggestions.fromJson(Map<String, Object?> json) => _$SearchSuggestionsFromJson(json);

  final List<String> top;
  final List<String> recent;
  @JsonKey(name: 'top_titles')
  final List<TitleCard> topTitles;

  Map<String, Object?> toJson() => _$SearchSuggestionsToJson(this);
}
