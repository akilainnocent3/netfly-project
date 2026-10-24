// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'title_card.dart';
import 'title_detail.dart';
import 'viewer_state.dart';

part 'title_page.g.dart';

@JsonSerializable()
class TitlePage {
  const TitlePage({required this.title, required this.viewer, required this.moreLikeThis});

  factory TitlePage.fromJson(Map<String, Object?> json) => _$TitlePageFromJson(json);

  final TitleDetail title;
  final ViewerState? viewer;
  @JsonKey(name: 'more_like_this')
  final List<TitleCard> moreLikeThis;

  Map<String, Object?> toJson() => _$TitlePageToJson(this);
}
