// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'episode_page.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EpisodePage _$EpisodePageFromJson(Map<String, dynamic> json) => EpisodePage(
  results: (json['results'] as List<dynamic>).map((e) => Episode.fromJson(e as Map<String, dynamic>)).toList(),
  next: (json['next'] as num?)?.toInt(),
  season: SeasonSummary.fromJson(json['season'] as Map<String, dynamic>),
);

Map<String, dynamic> _$EpisodePageToJson(EpisodePage instance) => <String, dynamic>{
  'results': instance.results,
  'next': ?instance.next,
  'season': instance.season,
};
