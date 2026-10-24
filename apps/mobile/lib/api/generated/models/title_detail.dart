// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'badge_enum.dart';
import 'card_context.dart';
import 'genre.dart';
import 'image_ref.dart';
import 'quality_enum.dart';
import 'season_summary.dart';
import 'title_type_enum.dart';
import 'translation_status_enum.dart';

part 'title_detail.g.dart';

@JsonSerializable()
class TitleDetail {
  const TitleDetail({
    required this.id,
    required this.slug,
    required this.title,
    required this.type,
    required this.seasonCount,
    required this.translationStatus,
    required this.poster,
    required this.backdrop,
    required this.logo,
    required this.genres,
    required this.hasPreview,
    required this.match,
    required this.context,
    required this.inMyList,
    required this.rating,
    required this.badge,
    required this.top10Rank,
    required this.moods,
    required this.genresFull,
    required this.seasons,
    required this.quality,
    this.year,
    this.maturityRating,
    this.runtimeMinutes,
    this.shortSynopsis,
    this.translatorName,
    this.originalTitle,
    this.synopsis,
    this.language,
    this.cast,
    this.directors,
    this.publishedAt,
  });

  factory TitleDetail.fromJson(Map<String, Object?> json) => _$TitleDetailFromJson(json);

  final int id;
  final String slug;
  final String title;
  final TitleTypeEnum type;
  final int? year;
  @JsonKey(name: 'maturity_rating')
  final String? maturityRating;
  @JsonKey(name: 'runtime_minutes')
  final int? runtimeMinutes;
  @JsonKey(name: 'season_count')
  final int? seasonCount;
  @JsonKey(name: 'short_synopsis')
  final String? shortSynopsis;
  @JsonKey(name: 'translation_status')
  final TranslationStatusEnum translationStatus;
  @JsonKey(name: 'translator_name')
  final String? translatorName;
  final ImageRef? poster;
  final ImageRef? backdrop;
  final ImageRef? logo;
  final List<String> genres;
  @JsonKey(name: 'has_preview')
  final bool hasPreview;
  final int? match;
  final CardContext? context;
  @JsonKey(name: 'in_my_list')
  final bool? inMyList;
  final int? rating;
  final BadgeEnum? badge;
  @JsonKey(name: 'top10_rank')
  final int? top10Rank;
  final List<String> moods;
  @JsonKey(name: 'original_title')
  final String? originalTitle;
  final String? synopsis;
  final String? language;
  final List<String>? cast;
  final List<String>? directors;
  @JsonKey(name: 'genres_full')
  final List<Genre> genresFull;
  final List<SeasonSummary> seasons;
  @JsonKey(name: 'published_at')
  final DateTime? publishedAt;
  final QualityEnum? quality;

  Map<String, Object?> toJson() => _$TitleDetailToJson(this);
}
