// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'title_card.dart';
import 'upcoming.dart';

part 'new_and_popular.g.dart';

@JsonSerializable()
class NewAndPopular {
  const NewAndPopular({
    required this.comingSoon,
    required this.everyoneWatching,
    required this.top10Series,
    required this.top10Films,
  });

  factory NewAndPopular.fromJson(Map<String, Object?> json) => _$NewAndPopularFromJson(json);

  @JsonKey(name: 'coming_soon')
  final List<Upcoming> comingSoon;
  @JsonKey(name: 'everyone_watching')
  final List<TitleCard> everyoneWatching;
  @JsonKey(name: 'top10_series')
  final List<TitleCard> top10Series;
  @JsonKey(name: 'top10_films')
  final List<TitleCard> top10Films;

  Map<String, Object?> toJson() => _$NewAndPopularToJson(this);
}
