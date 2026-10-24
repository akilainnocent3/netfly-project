// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'related_term.dart';
import 'title_card.dart';

part 'search_response.g.dart';

@JsonSerializable()
class SearchResponse {
  const SearchResponse({required this.results, required this.related});

  factory SearchResponse.fromJson(Map<String, Object?> json) => _$SearchResponseFromJson(json);

  final List<TitleCard> results;
  final List<RelatedTerm> related;

  Map<String, Object?> toJson() => _$SearchResponseToJson(this);
}
