// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'play_target.dart';

part 'viewer_state.g.dart';

@JsonSerializable()
class ViewerState {
  const ViewerState({required this.inMyList, required this.rating, required this.play, required this.lastSeason});

  factory ViewerState.fromJson(Map<String, Object?> json) => _$ViewerStateFromJson(json);

  @JsonKey(name: 'in_my_list')
  final bool inMyList;
  final int? rating;
  final PlayTarget? play;
  @JsonKey(name: 'last_season')
  final int? lastSeason;

  Map<String, Object?> toJson() => _$ViewerStateToJson(this);
}
