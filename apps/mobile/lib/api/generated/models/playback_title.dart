// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'image_ref.dart';

part 'playback_title.g.dart';

@JsonSerializable()
class PlaybackTitle {
  const PlaybackTitle({
    required this.id,
    required this.slug,
    required this.title,
    required this.type,
    required this.maturityRating,
    required this.logo,
    required this.backdrop,
  });

  factory PlaybackTitle.fromJson(Map<String, Object?> json) => _$PlaybackTitleFromJson(json);

  final int id;
  final String slug;
  final String title;
  final String type;
  @JsonKey(name: 'maturity_rating')
  final String maturityRating;
  final ImageRef? logo;
  final ImageRef? backdrop;

  Map<String, Object?> toJson() => _$PlaybackTitleToJson(this);
}
