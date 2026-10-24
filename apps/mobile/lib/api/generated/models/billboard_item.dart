// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'title_card.dart';

part 'billboard_item.g.dart';

@JsonSerializable()
class BillboardItem {
  const BillboardItem({
    required this.id,
    required this.headline,
    required this.tagline,
    required this.useTrailer,
    required this.title,
  });

  factory BillboardItem.fromJson(Map<String, Object?> json) => _$BillboardItemFromJson(json);

  final int id;
  final String headline;
  final String tagline;
  @JsonKey(name: 'use_trailer')
  final bool useTrailer;
  final TitleCard title;

  Map<String, Object?> toJson() => _$BillboardItemToJson(this);
}
