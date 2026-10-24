// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'genre_link.dart';
import 'title_card.dart';

part 'landing.g.dart';

@JsonSerializable()
class Landing {
  const Landing({required this.trending, required this.genres});

  factory Landing.fromJson(Map<String, Object?> json) => _$LandingFromJson(json);

  final List<TitleCard> trending;
  final List<GenreLink> genres;

  Map<String, Object?> toJson() => _$LandingToJson(this);
}
