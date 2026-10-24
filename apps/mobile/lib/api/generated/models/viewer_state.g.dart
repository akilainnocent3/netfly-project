// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'viewer_state.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ViewerState _$ViewerStateFromJson(Map<String, dynamic> json) => ViewerState(
  inMyList: json['in_my_list'] as bool,
  rating: (json['rating'] as num?)?.toInt(),
  play: json['play'] == null ? null : PlayTarget.fromJson(json['play'] as Map<String, dynamic>),
  lastSeason: (json['last_season'] as num?)?.toInt(),
);

Map<String, dynamic> _$ViewerStateToJson(ViewerState instance) => <String, dynamic>{
  'in_my_list': instance.inMyList,
  'rating': ?instance.rating,
  'play': ?instance.play,
  'last_season': ?instance.lastSeason,
};
