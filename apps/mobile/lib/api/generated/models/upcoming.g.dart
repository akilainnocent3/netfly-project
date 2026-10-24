// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upcoming.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Upcoming _$UpcomingFromJson(Map<String, dynamic> json) => Upcoming(
  id: (json['id'] as num).toInt(),
  slug: json['slug'] as String,
  title: json['title'] as String,
  type: TitleTypeEnum.fromJson(json['type'] as String),
  seasonCount: (json['season_count'] as num?)?.toInt(),
  translationStatus: TranslationStatusEnum.fromJson(json['translation_status'] as String),
  poster: json['poster'] == null ? null : ImageRef.fromJson(json['poster'] as Map<String, dynamic>),
  backdrop: json['backdrop'] == null ? null : ImageRef.fromJson(json['backdrop'] as Map<String, dynamic>),
  logo: json['logo'] == null ? null : ImageRef.fromJson(json['logo'] as Map<String, dynamic>),
  genres: (json['genres'] as List<dynamic>).map((e) => e as String).toList(),
  hasPreview: json['has_preview'] as bool,
  match: (json['match'] as num?)?.toInt(),
  context: json['context'] == null ? null : CardContext.fromJson(json['context'] as Map<String, dynamic>),
  inMyList: json['in_my_list'] as bool?,
  rating: (json['rating'] as num?)?.toInt(),
  badge: json['badge'] == null ? null : BadgeEnum.fromJson(json['badge'] as String),
  top10Rank: (json['top10_rank'] as num?)?.toInt(),
  moods: (json['moods'] as List<dynamic>).map((e) => e as String).toList(),
  synopsis: json['synopsis'] as String,
  reminded: json['reminded'] as bool?,
  year: (json['year'] as num?)?.toInt(),
  maturityRating: json['maturity_rating'] as String?,
  runtimeMinutes: (json['runtime_minutes'] as num?)?.toInt(),
  shortSynopsis: json['short_synopsis'] as String?,
  translatorName: json['translator_name'] as String?,
  publishAt: json['publish_at'] == null ? null : DateTime.parse(json['publish_at'] as String),
);

Map<String, dynamic> _$UpcomingToJson(Upcoming instance) => <String, dynamic>{
  'id': instance.id,
  'slug': instance.slug,
  'title': instance.title,
  'type': instance.type,
  'year': ?instance.year,
  'maturity_rating': ?instance.maturityRating,
  'runtime_minutes': ?instance.runtimeMinutes,
  'season_count': ?instance.seasonCount,
  'short_synopsis': ?instance.shortSynopsis,
  'translation_status': instance.translationStatus,
  'translator_name': ?instance.translatorName,
  'poster': ?instance.poster,
  'backdrop': ?instance.backdrop,
  'logo': ?instance.logo,
  'genres': instance.genres,
  'has_preview': instance.hasPreview,
  'match': ?instance.match,
  'context': ?instance.context,
  'in_my_list': ?instance.inMyList,
  'rating': ?instance.rating,
  'badge': ?instance.badge,
  'top10_rank': ?instance.top10Rank,
  'moods': instance.moods,
  'synopsis': instance.synopsis,
  'publish_at': ?instance.publishAt?.toIso8601String(),
  'reminded': ?instance.reminded,
};
