// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'new_and_popular.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NewAndPopular _$NewAndPopularFromJson(Map<String, dynamic> json) => NewAndPopular(
  comingSoon: (json['coming_soon'] as List<dynamic>).map((e) => Upcoming.fromJson(e as Map<String, dynamic>)).toList(),
  everyoneWatching: (json['everyone_watching'] as List<dynamic>)
      .map((e) => TitleCard.fromJson(e as Map<String, dynamic>))
      .toList(),
  top10Series: (json['top10_series'] as List<dynamic>)
      .map((e) => TitleCard.fromJson(e as Map<String, dynamic>))
      .toList(),
  top10Films: (json['top10_films'] as List<dynamic>).map((e) => TitleCard.fromJson(e as Map<String, dynamic>)).toList(),
);

Map<String, dynamic> _$NewAndPopularToJson(NewAndPopular instance) => <String, dynamic>{
  'coming_soon': instance.comingSoon,
  'everyone_watching': instance.everyoneWatching,
  'top10_series': instance.top10Series,
  'top10_films': instance.top10Films,
};
