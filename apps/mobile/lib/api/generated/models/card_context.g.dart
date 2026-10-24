// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'card_context.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CardContext _$CardContextFromJson(Map<String, dynamic> json) => CardContext(
  progress: (json['progress'] as num?)?.toDouble(),
  label: json['label'] as String?,
  episodeId: (json['episode_id'] as num?)?.toInt(),
  rank: (json['rank'] as num?)?.toInt(),
  otherMode: json['other_mode'] as bool?,
);

Map<String, dynamic> _$CardContextToJson(CardContext instance) => <String, dynamic>{
  'progress': ?instance.progress,
  'label': ?instance.label,
  'episode_id': ?instance.episodeId,
  'rank': ?instance.rank,
  'other_mode': ?instance.otherMode,
};
